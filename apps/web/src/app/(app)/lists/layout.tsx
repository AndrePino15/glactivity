import { PageHeader } from "@/components/ui";
import { ListsNav } from "./ListsNav";

export default function ListsLayout({ children }: LayoutProps<"/lists">) {
  return (
    <>
      <PageHeader title="Lists" />
      <ListsNav />
      {children}
    </>
  );
}
