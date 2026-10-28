"use client";

import React, { Suspense } from "react";
import { PortalLayout } from "@/features/layout";
import { StudentEnrollmentView } from "@/features/enrollment";
import { RefreshCw } from "lucide-react";

export default function EnrollmentPage() {
  return (
    <PortalLayout>
      <Suspense
        fallback={
          <div className="min-h-[300px] flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        }
      >
        <StudentEnrollmentView />
      </Suspense>
    </PortalLayout>
  );
}
