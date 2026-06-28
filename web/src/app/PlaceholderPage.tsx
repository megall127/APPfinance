interface PlaceholderPageProps {
  title: string
}

/**
 * Temporary stub rendered for routes not yet implemented.
 * Each route's real page (Tasks 16–22) will replace this component.
 */
export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-muted-foreground text-sm">em construção</p>
    </div>
  )
}
