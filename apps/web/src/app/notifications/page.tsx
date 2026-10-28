"use client";

import React from "react";
import { PortalLayout } from "@/features/layout";
import { NotificationsView } from "@/features/notifications";

export default function NotificationsPage() {
  return (
    <PortalLayout>
      <NotificationsView />
    </PortalLayout>
  );
}
