"use client";

import { usePathname } from "next/navigation";
import Header from "./header";

export default function ConditionalHeader() {
  const pathname = usePathname();

  // Don't show header on landing page and sign-in page
  if (pathname === "/" || pathname === "/auth/signin") {
    return null;
  }

  return <Header />;
}
