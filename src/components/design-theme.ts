import type { ThemeConfig } from "antd";

/** Shared component tokens. CSS layout tokens live in app/globals.css. */
export const designTheme: ThemeConfig = {
  token: {
    colorPrimary: "#0071e3", colorInfo: "#0071e3",
    colorSuccess: "#216744", colorWarning: "#80530b", colorError: "#a13035",
    colorText: "#30343b", colorTextHeading: "#1d1d1f", colorTextSecondary: "#667085", colorTextTertiary: "#7a8190",
    colorBorder: "#dedee2", colorBorderSecondary: "#e5e5e7",
    colorBgLayout: "#f5f5f7", colorBgContainer: "#ffffff",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 14, borderRadius: 8, borderRadiusLG: 14, controlHeight: 38,
    motionDurationMid: "0.18s", motionDurationSlow: "0.22s",
    boxShadowSecondary: "0 12px 48px rgb(29 29 31 / 10%)",
  },
  components: {
    Button: { primaryShadow: "none", defaultShadow: "0 1px 2px rgb(0 0 0 / 3%)", fontWeight: 500 },
    Table: { headerBg: "#f8f9fb", headerColor: "#475467", cellPaddingBlock: 18, cellPaddingInline: 20, rowHoverBg: "#f7f9fc" },
    Tag: { defaultBg: "#f5f5f7", defaultColor: "#475467", fontSizeSM: 13 },
    Tabs: { horizontalItemGutter: 28, titleFontSize: 14, inkBarColor: "#1d1d1f", itemSelectedColor: "#1d1d1f" },
    Segmented: { trackBg: "#f0f0f2", itemSelectedBg: "#ffffff" },
    Drawer: { footerPaddingBlock: 18, footerPaddingInline: 28 },
  },
};
