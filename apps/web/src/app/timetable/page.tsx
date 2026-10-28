"use client";

import React from "react";
import { PortalLayout } from "@/features/layout";
import { TimetableView } from "@/features/timetable";

export default function TimetablePage() {
  return (
    <PortalLayout>
      <TimetableView />
    </PortalLayout>
  );
}
