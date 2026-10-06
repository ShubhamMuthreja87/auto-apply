/**
 * The Evaluations of a Run as a table (shown to the user as "Jobs"), one row per Job Key, updated in place
 * as `eval` events arrive.
 */
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { Evaluation } from "@auto-apply/shared";
import { StatusChip, VerdictChip } from "../ui/StatusChip";
import { FallbackLabel, PostingSourceCell, reasonText, scoreText } from "./evaluationCells";

export function EvaluationsTable({ evaluations }: { evaluations: Evaluation[] }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Jobs in this run">
        <TableHead>
          <TableRow>
            <TableCell>Company</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Verdict</TableCell>
            <TableCell align="right">Score</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {evaluations.map(({ jobKey, posting, verdict, score, scoredBy, status, reason }) => (
            <TableRow key={jobKey} hover>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{posting.company}</TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{posting.title}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                <PostingSourceCell posting={posting} />
              </TableCell>
              <TableCell>
                <VerdictChip verdict={verdict} />
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {scoreText(score)}
                <FallbackLabel scoredBy={scoredBy} />
              </TableCell>
              <TableCell>
                <StatusChip status={status} />
              </TableCell>
              <TableCell sx={{ color: "text.secondary", minWidth: 200 }}>
                {reasonText({ status, reason })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
