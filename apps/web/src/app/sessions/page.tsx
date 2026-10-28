"use client";

import React from "react";
import { PortalLayout } from "@/features/layout";
import { SessionList } from "@/features/sessions";

export default function SessionsPage() {
  return (
    <PortalLayout>
      <SessionList />
    </PortalLayout>
  );
}
