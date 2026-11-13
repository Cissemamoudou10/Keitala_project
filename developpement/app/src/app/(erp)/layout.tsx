import { Coquille } from "@/components/coquille/coquille";
import { Toaster } from "@/components/ui/sonner";

// Le rôle viendra de la session (Sprint 1, US-AUTH-01) ; d'ici là, aucune entrée réservée.
export default function LayoutErp({ children }: LayoutProps<"/">) {
  return (
    <>
      <Coquille role={null}>{children}</Coquille>
      <Toaster />
    </>
  );
}
