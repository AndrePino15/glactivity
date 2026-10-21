import { Sidebar, TabBar } from "@/components/Navigation";
import styles from "./layout.module.css";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Sidebar />
      <main className={styles.main}>{children}</main>
      <TabBar />
    </>
  );
}
