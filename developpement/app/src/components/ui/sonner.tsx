"use client";

import { Toaster as Sonner } from "sonner";
import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";

/**
 * Zone des notifications (section 7) : en bas à droite, 4 secondes.
 * À poser une fois dans la mise en page ; on notifie avec `notifier` (lib/notifications).
 */
function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      duration={4000}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4 text-succes" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-attention" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-md bg-fond p-4 text-sm text-texte shadow-flottant sm:w-90",
          icon: "mt-0.5",
          content: "flex flex-1 flex-col gap-1",
          title: "font-normal",
          description: "text-texte-2",
          error: "text-danger",
          actionButton: "ml-auto font-medium text-accent hover:underline",
          closeButton:
            "order-last flex size-6 items-center justify-center rounded-sm text-texte-2 hover:bg-fond-survol",
        },
      }}
    />
  );
}

export { Toaster };
