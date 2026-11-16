// Pages à imprimer (facture) : sans menu ni coquille, fond blanc (D-032).
export default function LayoutImpression({ children }: LayoutProps<"/">) {
  return <main className="print:bg-white flex-1 bg-fond">{children}</main>;
}
