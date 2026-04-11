export default function Unauthorized() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-red-600">Yetkisiz Erişim</h1>
      <p>Bu alana erişim yetkiniz yok. Lütfen yöneticinizle iletişime geçin.</p>
    </div>
  )
}

