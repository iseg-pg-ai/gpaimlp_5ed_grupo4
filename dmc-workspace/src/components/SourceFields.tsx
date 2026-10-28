// Mostra a proveniência e os campos de origem necessários à revisão do registo.
import { T } from "./LocaleProvider";
export function SourceFields({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      {Object.entries(value)
        .filter(
          ([key]) =>
            !key.startsWith("_") &&
            !/^(?:id(?:_|$)|catalog_id$|revision$|snapshot|hash)/i.test(key),
        )
        .map(([key, item]) => (
          <div key={key} className="min-w-0">
            <dt className="font-semibold break-words">{key.replaceAll("_", " ")}</dt>
            <dd className="break-words whitespace-pre-wrap text-sm">
              {item === null || item === undefined || item === "" ? (
                <T text="Não indicado" source="pt" />
              ) : typeof item === "object" ? (
                Array.isArray(item) ? (
                  <ul className="space-y-2">
                    {item.map((entry, index) => (
                      <li key={index}>
                        {entry && typeof entry === "object" ? (
                          <SourceFields value={entry as Record<string, unknown>} />
                        ) : entry === null || entry === undefined || entry === "" ? (
                          <T text="Não indicado" source="pt" />
                        ) : (
                          String(entry)
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <SourceFields value={item as Record<string, unknown>} />
                )
              ) : (
                String(item)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
