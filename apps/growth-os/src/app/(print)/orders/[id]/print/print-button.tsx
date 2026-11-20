"use client";

import { Printer } from "lucide-react";
import { Button } from "@platform/ui";

export function PrintButton() {
  return <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>;
}
