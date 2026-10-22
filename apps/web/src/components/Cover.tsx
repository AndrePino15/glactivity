import Image from "next/image";
import styles from "./Cover.module.css";

/** Album, book or film artwork. Square for albums, portrait for books and films. */
export function Cover({
  src,
  size,
  shape = "square",
  alt = "",
}: {
  src: string | null | undefined;
  size: number;
  shape?: "square" | "portrait";
  alt?: string;
}) {
  const height = shape === "square" ? size : Math.round(size * 1.5);
  if (!src) return <span className={styles.blank} style={{ width: size, height }} />;
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={height}
      unoptimized
      className={styles.cover}
      style={{ width: size, height }}
    />
  );
}
