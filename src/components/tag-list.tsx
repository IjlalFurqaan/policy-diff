import { Badge } from "@/components/ui/badge";
import { TAG_DESCRIPTIONS, TAG_LABELS, isChangeTag } from "@/lib/tags";

export function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.filter(isChangeTag).map((tag) => (
        <li key={tag}>
          <Badge variant="outline" title={TAG_DESCRIPTIONS[tag]}>
            {TAG_LABELS[tag]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
