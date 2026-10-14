// @vinshc/documents: one place to open every print form. The print actions belong to the modules
// that own their source records (billing, scheduling, orders, pharmacy); this section only lists
// them, so a form disappears here when its module is not deployed or the role cannot print it.
import { defineModule } from "@vinshc/core";

export default defineModule({
  name: "documents",
  version: "0.1.0",
  order: 130,
  sections: [
    {
      id: "documents",
      title: "Chứng từ & mẫu in",
      resource: "billing",
      order: 130,
      actions: [
        "printReceipt",
        "printRefund",
        "printAppointment",
        "printOrder",
        "printResult",
        "printPrescription",
      ],
      note: "Mẫu in lấy số chứng từ và nội dung từ backend; chưa có chữ ký điện tử. Backend hiện kiểm tra quyền diagnostic_order print cả với đơn thuốc và kết quả, nên một số vai trò chưa được mở mẫu in.",
      overview: false,
    },
  ],
});
