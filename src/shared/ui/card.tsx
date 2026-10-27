import {
  forwardRef,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  href?: string;
  linkLabel?: string;
  image?: string;
  imageAlt?: string;
}

export interface CardHeaderProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface CardBodyProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface CardFooterProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface CardImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string;
  alt: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  function Card(
    {
      children,
      className = "",
      href,
      linkLabel,
      image,
      imageAlt = "",
      ...props
    },
    ref,
  ) {
    const classes = [
      "relative min-w-0 overflow-hidden rounded-lg border",
      "border-[var(--color-border)] bg-[var(--color-surface)]",
      "text-[var(--color-text)]",
      // The link fills the card, so its own outline would be clipped by
      // overflow-hidden. Draw the keyboard focus ring on the card instead.
      "has-[>a:focus-visible]:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
      "has-[>a:focus-visible]:[outline-offset:var(--focus-ring-offset)]",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {image ? (
          <img
            src={image}
            alt={imageAlt}
            className="block aspect-video w-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex aspect-video w-full items-center justify-center bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"
          >
            Image unavailable
          </div>
        )}

        <div className="min-w-0 p-4">
          {children}
        </div>

        {href ? (
          <a
            href={href}
            aria-label={linkLabel}
            className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none"
          />
        ) : null}
      </div>
    );
  },
);

Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  CardHeaderProps
>(function CardHeader(
  { children, className = "", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`mb-3 min-w-0 break-words ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

CardHeader.displayName = "CardHeader";

export const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(
  function CardBody(
    { children, className = "", ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`min-w-0 break-words ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

CardBody.displayName = "CardBody";

export const CardFooter = forwardRef<
  HTMLDivElement,
  CardFooterProps
>(function CardFooter(
  { children, className = "", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`mt-4 flex min-w-0 flex-wrap items-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

CardFooter.displayName = "CardFooter";

export const CardImage = forwardRef<
  HTMLImageElement,
  CardImageProps
>(function CardImage(
  { src, alt, className = "", ...props },
  ref,
) {
  if (!src) {
    return (
      <div
        aria-hidden="true"
        className={`flex aspect-video w-full items-center justify-center bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] ${className}`}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={`block aspect-video w-full object-cover ${className}`}
      {...props}
    />
  );
});

CardImage.displayName = "CardImage";
