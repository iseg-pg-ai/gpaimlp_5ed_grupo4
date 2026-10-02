import { T } from "./LocaleProvider";
export function SourceFields({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      {Object.entries(value).map(([key, item]) => (
        <div key={key} className="min-w-0">
          <dt className="font-semibold break-words">{key.replaceAll("_", " ")}</dt>
          <dd className="break-words whitespace-pre-wrap text-sm">
            {item === null || item === undefined || item === "" ? (
              <T text="Não indicado" source="pt" />
            ) : typeof item === "object" ? (
              JSON.stringify(item, null, 2)
            ) : (
              String(item)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
