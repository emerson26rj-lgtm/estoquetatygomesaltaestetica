import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function usePagination<T>(items: T[], defaultPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );
  return { paged, page: safePage, setPage, pageSize, setPageSize, total, totalPages };
}

export function DataPagination(props: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const { page, totalPages, total, pageSize, onPage, onPageSize } = props;
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-t border-border/60 text-xs text-text-muted">
      <div>Exibindo {start}–{end} de {total}</div>
      <div className="flex items-center gap-2">
        <span>Por página:</span>
        <Select value={String(pageSize)} onValueChange={(v) => { onPageSize(Number(v)); onPage(1); }}>
          <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-2">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPage(page - 1)} disabled={page <= 1}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="px-2">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
