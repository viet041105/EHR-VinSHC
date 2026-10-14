// @vinshc/reports: aggregate daily and multi-day facility reports (no patient data).
// Contract: docs/api/clinic-operations.md.
import { defineModule, action, F, qs } from "@vinshc/core";

const actions = {
  report: action(
    "Báo cáo ngày",
    "reports",
    "read",
    [F("date", "Ngày báo cáo", "date")],
    (d) =>
      "operations/reports/daily?" +
      new URLSearchParams({ date: d.date, facility: d.facility }),
    null,
    { method: "GET", facility: true },
  ),
  rangeReport: action(
    "Báo cáo nhiều ngày",
    "reports",
    "read",
    [F("from", "Từ ngày", "date"), F("to", "Đến ngày", "date")],
    (d) =>
      "operations/reports/range?" +
      qs({ from: d.from, to: d.to, facility: d.facility }),
    null,
    {
      method: "GET",
      facility: true,
      notice: "Tối đa 31 ngày; chỉ số tổng hợp, không có thông tin người bệnh.",
    },
  ),
};

export default defineModule({
  name: "reports",
  version: "0.1.0",
  order: 110,
  sections: [
    {
      id: "reports",
      title: "Báo cáo",
      resource: "reports",
      order: 110,
      actions: ["report", "rangeReport"],
      icon: "▥",
    },
  ],
  actions,
});
