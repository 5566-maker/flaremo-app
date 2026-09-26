import {
  type BinaryTransport,
  decodeBinaryRequest,
  detectBinaryTransport,
} from "../../../memos-protobuf";
import { type ConnectContext, record } from "../shared";
import { connectError, connectErrorFrom } from "../transport";
import { memoService } from "./service-names";

/**
 * The HTTP media-type gate and the body decoder of the Connect unary endpoint.
 * The caller runs the gate first, then reads the path parameters, then decodes:
 * an unsupported media type must be rejected before any transport attempt.
 */
export interface ConnectTransportSelection {
  binaryTransport: BinaryTransport | undefined;
  unsupportedMediaType?: Response;
}

export function selectConnectTransport(
  c: ConnectContext,
): ConnectTransportSelection {
  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  const binaryTransport = detectBinaryTransport(contentType);
  if (!contentType.includes("application/json") && !binaryTransport) {
    return {
      binaryTransport,
      unsupportedMediaType: connectError(
        c,
        "unsupported_media_type",
        "Connect JSON or protobuf is required",
        415,
      ),
    };
  }
  return { binaryTransport };
}

export interface DecodedConnectRequest {
  body: unknown;
  method: string;
}

/**
 * Decode the request body and reconcile the historical GetSharedMemo alias with
 * the canonical GetMemoByShare RPC: the request key is reconciled first, then
 * the whole dispatch table is evaluated under the canonical name so aliases
 * cannot drift out of the method coverage.
 */
export async function decodeConnectRequestBody(
  c: ConnectContext,
  service: string,
  requestMethod: string,
  binaryTransport: BinaryTransport | undefined,
): Promise<DecodedConnectRequest | { errorResponse: Response }> {
  const isSharedMemoAlias =
    service === memoService && requestMethod === "GetSharedMemo";
  const method = isSharedMemoAlias ? "GetMemoByShare" : requestMethod;

  try {
    let body: unknown = binaryTransport
      ? decodeBinaryRequest(
          service,
          method,
          new Uint8Array(await c.req.raw.arrayBuffer()),
          binaryTransport,
        )
      : await c.req.json();
    if (isSharedMemoAlias) {
      // JSON alias callers may send either key; binary callers already have
      // the canonical shareId field.
      const request = record(body);
      body = { shareToken: request.shareToken ?? request.shareId };
    }
    return { body, method };
  } catch (error) {
    if (binaryTransport) {
      return { errorResponse: connectErrorFrom(c, error, binaryTransport) };
    }
    return {
      errorResponse: connectError(
        c,
        "invalid_argument",
        "Request body must be JSON",
        400,
      ),
    };
  }
}
