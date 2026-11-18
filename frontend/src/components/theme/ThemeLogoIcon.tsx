"use client";

import Image from "next/image";
import { isThemeIcon, ThemeIconSvg } from "./ThemeIcon";
import { useSiteTheme } from "./ThemeProvider";

// The small seasonal icon next to the CHUVACHI logo: the admin's own picture or a built-in icon.
export function ThemeLogoIcon() {
  const theme = useSiteTheme();
  if (theme?.iconUrl) {
    return <Image src={theme.iconUrl} alt="" width={28} height={28} className="h-7 w-7 object-contain" />;
  }
  const icon = theme?.icon;
  if (isThemeIcon(icon)) {
    return <ThemeIconSvg name={icon} size={26} />;
  }
  return null;
}
