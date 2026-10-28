"use client";

import React from "react";
import { PortalLayout } from "@/features/layout";
import { DashboardView } from "@/features/dashboard";

export default function DashboardPage() {
  return (
    <PortalLayout>
      <DashboardView />
    </PortalLayout>
  );
}
