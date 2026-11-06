// Attachments: thumbnails that open in bb's lightbox, and downloadable files.
import { useCallback, useState } from "react";
import {
  UrlLink,
  experimental_ImageLightbox as ImageLightbox,
  experimental_usePluginId as usePluginId,
} from "@get-bb/plugin-sdk/app";
import type { Attachment } from "../server";
import { Icon } from "@/components/ui/icon";

/** The plugin route that streams a file stored in Asana. */
export function useAttachmentUrl() {
  const pluginId = usePluginId();
  return useCallback(
    (gid: string, download: boolean) =>
      `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/attachment?gid=${gid}${download ? "&download=1" : ""}`,
    [pluginId],
  );
}

export function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Image thumbnails that open in bb's lightbox. */
export function ImageStrip({ images, captions = false }: { images: Attachment[]; captions?: boolean }) {
  const attachmentUrl = useAttachmentUrl();
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  const current = open === null ? null : images[open];
  return (
    <>
      <ul className="mt-2 flex flex-wrap gap-2">
        {images.map((image, index) => (
          <li key={image.gid}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              // With a caption the visible file name is the button's name.
              aria-label={captions ? undefined : `View ${image.name}`}
              className="group/thumb block w-36 overflow-hidden rounded-md border border-border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={attachmentUrl(image.gid, false)}
                alt=""
                loading="lazy"
                className="h-24 w-36 object-cover transition-opacity group-hover/thumb:opacity-90"
              />
              {captions ? (
                <span className="block truncate border-t border-border bg-card px-2 py-1 text-xs text-muted-foreground">
                  {image.name}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <ImageLightbox
        isOpen={current != null}
        title={current?.name ?? ""}
        imageAlt={current?.name ?? ""}
        imageSrc={current == null ? null : attachmentUrl(current.gid, false)}
        hasMultipleImages={images.length > 1}
        previousDisabled={open === null || open === 0}
        nextDisabled={open === null || open === images.length - 1}
        navigationStatus={open === null ? undefined : `${open + 1} of ${images.length}`}
        onClose={() => setOpen(null)}
        onPrevious={() => setOpen((index) => (index === null ? null : Math.max(0, index - 1)))}
        onNext={() =>
          setOpen((index) => (index === null ? null : Math.min(images.length - 1, index + 1)))
        }
      />
    </>
  );
}

/** Images as captioned thumbnails (open in the viewer); other files as rows. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const attachmentUrl = useAttachmentUrl();
  const images = attachments.filter((attachment) => attachment.isImage);
  const files = attachments.filter((attachment) => !attachment.isImage);
  return (
    <>
      <ImageStrip images={images} captions />
      {files.length === 0 ? null : (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((attachment) => {
            const size = formatSize(attachment.size);
            return (
              <li
                key={attachment.gid}
                className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
              >
                <Icon name="FileText" fallback="File" aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                {size === null ? null : (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{size}</span>
                )}
                {attachment.host === "asana" ? (
                  <a
                    href={attachmentUrl(attachment.gid, true)}
                    download={attachment.name}
                    aria-label={`Download ${attachment.name}`}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="Download" aria-hidden className="size-4" />
                  </a>
                ) : attachment.externalUrl === null ? null : (
                  <UrlLink
                    href={attachment.externalUrl}
                    className="shrink-0 text-xs text-foreground underline-offset-2 hover:underline"
                  >
                    Open in {attachment.host}
                  </UrlLink>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
