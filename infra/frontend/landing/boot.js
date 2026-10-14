// Keep a failed module download from leaving the public entry page empty.
try {
  await import("./app.js");
} catch (error) {
  console.error("VinSHC could not load the public page", error);
  const root = document.querySelector("#app");
  root.innerHTML = `<section class="panel" role="alert" style="max-width:600px;margin:80px auto;padding:28px"><h1 style="font-size:24px">Chưa tải được trang</h1><p>Vui lòng tải lại trang. Nếu vẫn gặp lỗi, thử mở trong tab mới.</p><button type="button" id="retryStartup">Tải lại trang</button><p><a href="/connected.html">Đi đến đăng nhập phòng khám</a></p></section>`;
  root.querySelector("#retryStartup").addEventListener("click", () => location.reload());
}
