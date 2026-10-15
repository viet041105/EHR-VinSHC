// @vinshc/reports: aggregate daily and multi-day facility reports (no patient data).
// Contract: docs/api/clinic-operations.md.
import { defineModule, action, F, qs, BackendError, esc, facilityForLocation } from "@vinshc/core";

export function validateReportRange(d) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(d.from) || !valid(d.to)) throw new BackendError('Chọn đủ ngày bắt đầu và ngày kết thúc hợp lệ.');
  const days = (Date.parse(d.to) - Date.parse(d.from)) / 86400000;
  if (days < 0) throw new BackendError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
  if (days > 30) throw new BackendError('Báo cáo chỉ xem được tối đa 31 ngày, tính cả ngày bắt đầu và kết thúc.');
}
function reportStart(ctx) {
  return `<section class="panel report-start"><div><span class="eyebrow">BÁO CÁO CỦA CƠ SỞ</span><h2>${esc(facilityForLocation(ctx.facility)?.name || 'Cơ sở đang làm việc')}</h2><p>Chọn nhanh thời gian cần xem. Số liệu chỉ xuất hiện sau khi được tải từ hệ thống.</p></div><div class="report-presets"><button type="button" data-report-days="1">Hôm nay</button><button type="button" data-report-days="1" data-yesterday="true">Hôm qua</button><button type="button" data-report-days="7">7 ngày gần đây</button><button type="button" data-report-days="30">30 ngày gần đây</button></div></section>`;
}

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
      prepare: validateReportRange,
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
      header: reportStart,
    },
  ],
  actions,
});
