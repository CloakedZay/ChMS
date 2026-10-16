// Every row of a query, asked 1,000 at a time: Supabase returns at most
// 1,000 rows per request, so a plain select quietly stops there. The query
// needs an order that never ties (end with a unique column such as id), or
// rows could repeat or go missing between batches.
//
//   const { data, error } = await fetchAll(() =>
//     supabase.from('members').select('full_name').order('id'));
export async function fetchAll(makeQuery, size = 1000) {
  const rows = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await makeQuery().range(from, from + size - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < size) return { data: rows, error: null };
  }
}
