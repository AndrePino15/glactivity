"use client";

import Image from "next/image";
import Link from "next/link";
import { Cover } from "@/components/Cover";
import { useAlbumOfTheWeek } from "@/lib/album";
import { startOfWeek, type ISODate } from "@/lib/dates";
import { useList } from "@/lib/db/hooks";
import { watchNext } from "@/lib/suggest";
import styles from "./today-media.module.css";

/** Album of the week as a large card, with the current book and next film beside it. */
export function TodayMedia({ today }: { today: ISODate }) {
  const { current } = useAlbumOfTheWeek(today);
  const books = useList("books");
  const movies = useList("movies");
  const book = books.data.find((b) => b.status === "active");
  const film = watchNext(movies.data, startOfWeek(today));

  const albumCover = current?.artwork_url ? (
    <Image src={current.artwork_url} alt="" width={600} height={600} unoptimized className={styles.albumCover} />
  ) : (
    <span className={styles.albumCover} />
  );

  return (
    <section className={styles.media} aria-label="Listening, reading and watching">
      <div className={styles.album}>
        <p className={styles.label}>Album of the week</p>
        {current ? (
          <a
            href={current.apple_music_url ?? "/fun"}
            target={current.apple_music_url ? "_blank" : undefined}
            rel="noreferrer"
            className={styles.albumLink}
          >
            {albumCover}
            <span className={styles.albumTitle}>{current.title}</span>
            {current.artist && <span className={styles.albumArtist}>{current.artist}</span>}
          </a>
        ) : (
          <Link href="/lists/listen" className={styles.albumLink}>
            <span className={`${styles.albumCover} ${styles.emptyCover}`}>Add albums to Listen</span>
          </Link>
        )}
      </div>

      <div className={styles.side}>
        <SideItem
          label="Reading"
          href="/lists/read"
          title={book?.title}
          detail={book?.subtitle}
          artwork={book?.meta.artwork}
          empty="Add a book"
        />
        <SideItem
          label={film?.watching ? "Watching" : "Watch next"}
          href={film?.item.meta.url ?? "/lists/watch"}
          external={Boolean(film?.item.meta.url)}
          title={film?.item.title}
          detail={film?.item.meta.year ?? film?.item.subtitle}
          artwork={film?.item.meta.artwork}
          empty="Add a film"
        />
      </div>
    </section>
  );
}

function SideItem({
  label,
  href,
  external,
  title,
  detail,
  artwork,
  empty,
}: {
  label: string;
  href: string;
  external?: boolean;
  title?: string;
  detail?: string | null;
  artwork?: string;
  empty: string;
}) {
  const body = (
    <>
      <Cover src={artwork} size={62} shape="portrait" />
      <span className={styles.sideText}>
        <span className={styles.label}>{label}</span>
        <span className={title ? styles.sideTitle : styles.sideEmpty}>{title ?? empty}</span>
        {title && detail && <span className={styles.sideDetail}>{detail}</span>}
      </span>
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={styles.sideItem}>
      {body}
    </a>
  ) : (
    <Link href={href} className={styles.sideItem}>
      {body}
    </Link>
  );
}
