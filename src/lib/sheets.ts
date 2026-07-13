import Papa from 'papaparse';

export function parseCsvRows(csvText: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => {
    const trimmedRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmedRow[key.trim()] = typeof value === 'string' ? value.trim() : value;
    }
    return trimmedRow;
  });
}

export async function fetchCsvRows(url: string): Promise<Record<string, string>[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data from ${url}: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  return parseCsvRows(csvText);
}
