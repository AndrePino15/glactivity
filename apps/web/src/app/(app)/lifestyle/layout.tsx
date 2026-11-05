import { PageHeader } from "@/components/ui";
import { LifestyleNav } from "./LifestyleNav";

export default function LifestyleLayout({ children }: LayoutProps<"/lifestyle">) {
  return (
    <>
      <PageHeader title="Lifestyle" />
      <LifestyleNav />
      {children}
    </>
  );
}
