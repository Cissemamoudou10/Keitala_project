import { Coquille } from "@/components/coquille/coquille";
import { Toaster } from "@/components/ui/sonner";

export default function LayoutErp({ children }: LayoutProps<"/">) {
  return (
    <>
      <Coquille>{children}</Coquille>
      <Toaster />
    </>
  );
}
