"use client";

import Image from "next/image";
import { Cover } from "@/components/Cover";
import { List, Note, Row, TextButton, TextLink } from "@/components/ui";
import { useAlbumOfTheWeek } from "@/lib/album";
import type { ISODate } from "@/lib/dates";
import styles from "./fun.module.css";

/** The large version for the Fun page. */
export function AlbumFeature({ today }: { today: ISODate | null }) {
  const { current, history, reroll, canReroll, loaded, hasAlbums } = useAlbumOfTheWeek(today);

  if (loaded && !current) {
    return hasAlbums ? (
      <Note>Picking this week’s album…</Note>
    ) : (
      <Note>
        Add albums to your{" "}
        <TextLink href="/lists/listen">Listen list</TextLink>{" "}
        and one will be picked every Monday.
      </Note>
    );
  }
  if (!current) return null;

  const cover = current.artwork_url ? (
    <Image src={current.artwork_url} alt="" width={600} height={600} unoptimized className={styles.bigCover} />
  ) : (
    <span className={styles.bigCover} />
  );
  return (
    <>
      <div className={styles.feature}>
        {current.apple_music_url ? (
          <a href={current.apple_music_url} target="_blank" rel="noreferrer" className={styles.featureCover}>
            {cover}
          </a>
        ) : (
          <div className={styles.featureCover}>{cover}</div>
        )}
        <div>
          <p className={styles.albumTitle}>{current.title}</p>
          {current.artist && <p className={styles.albumArtist}>{current.artist}</p>}
        </div>
        <div className={styles.featureActions}>
          {current.apple_music_url && (
            <TextLink href={current.apple_music_url} external>
              Listen on Apple Music
            </TextLink>
          )}
          {canReroll && <TextButton onClick={reroll}>Pick another</TextButton>}
        </div>
      </div>

      {history.length > 0 && (
        <div className={styles.history}>
          <p className={styles.historyTitle}>Previous weeks</p>
          <List>
            {history.map((pick) => (
              <Row
                key={pick.id}
                leading={<Cover src={pick.artwork_url} size={40} />}
                title={pick.title}
                detail={pick.artist}
                href={pick.apple_music_url ?? undefined}
                external
              />
            ))}
          </List>
        </div>
      )}
    </>
  );
}
