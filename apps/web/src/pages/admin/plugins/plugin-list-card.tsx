import { Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import type { PluginRow } from "./plugin-row";
import type { PluginSettingsState } from "./use-plugin-settings";

/**
 * The plugin list card: every bundled and installed plugin with its source
 * badge and on/off switch. The card-manager section renders inside the same
 * card body, so it arrives as `children`.
 */
export function PluginListCard({
  plugins,
  busy,
  pluginEnabled,
  togglePlugin,
  uninstallMutation,
  children,
}: {
  plugins: PluginRow[];
  busy: boolean;
  pluginEnabled: (row: PluginRow) => boolean;
  togglePlugin: (row: PluginRow, on: boolean) => void;
  uninstallMutation: PluginSettingsState["uninstallMutation"];
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.plugins.title")}</CardTitle>
        <CardDescription>{t("admin.plugins.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("admin.plugins.plugins")}</p>
          {plugins.map((row) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              key={row.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <Badge variant="secondary">
                    {t(
                      row.source === "installed"
                        ? "admin.plugins.tierStore"
                        : row.tier === "official"
                          ? "admin.plugins.tierOfficial"
                          : "admin.plugins.tierCommunity",
                    )}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {t("admin.plugins.cardCount", { count: row.cardCount })} · v
                  {row.version}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.source === "installed" && (
                  <Button
                    aria-label={t("admin.plugins.uninstall")}
                    disabled={busy}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => uninstallMutation.mutate(row.id)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
                <Switch
                  checked={pluginEnabled(row)}
                  disabled={busy}
                  onCheckedChange={(checked) => togglePlugin(row, checked)}
                />
              </div>
            </div>
          ))}
        </div>

        {children}
      </CardContent>
    </Card>
  );
}
