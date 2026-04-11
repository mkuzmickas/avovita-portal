/**
 * Loading skeleton for the catalogue. Used as the Suspense fallback in
 * the public tests page so users see structure immediately while data fetches.
 */
export function CatalogueSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 pb-32">
      {/* Featured heading */}
      <div className="mb-6">
        <div
          className="h-8 w-48 rounded animate-pulse mb-2"
          style={{ backgroundColor: "#1a3d22" }}
        />
        <div
          className="h-1 w-16 rounded"
          style={{ backgroundColor: "#c4973a" }}
        />
      </div>

      {/* Featured cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border p-5 space-y-3 animate-pulse"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <div className="flex gap-2">
              <div
                className="h-5 w-16 rounded-full"
                style={{ backgroundColor: "#0f2614" }}
              />
              <div
                className="h-5 w-20 rounded-full"
                style={{ backgroundColor: "#0f2614" }}
              />
            </div>
            <div
              className="h-6 w-3/4 rounded"
              style={{ backgroundColor: "#0f2614" }}
            />
            <div
              className="h-8 w-1/3 rounded"
              style={{ backgroundColor: "#0f2614" }}
            />
            <div
              className="h-3 w-2/3 rounded"
              style={{ backgroundColor: "#0f2614" }}
            />
            <div
              className="h-10 w-full rounded-lg"
              style={{ backgroundColor: "#0f2614" }}
            />
          </div>
        ))}
      </div>

      {/* Catalogue heading */}
      <div className="mb-6">
        <div
          className="h-8 w-64 rounded animate-pulse mb-2"
          style={{ backgroundColor: "#1a3d22" }}
        />
        <div
          className="h-1 w-16 rounded"
          style={{ backgroundColor: "#c4973a" }}
        />
      </div>

      {/* Filter row skeleton */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-10 flex-1 rounded-lg animate-pulse"
            style={{ backgroundColor: "#1a3d22" }}
          />
        ))}
      </div>

      {/* Table skeleton */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div
          className="h-12 border-b"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-14 border-b animate-pulse"
            style={{
              backgroundColor: i % 2 === 0 ? "#0a1a0d" : "#1a3d22",
              borderColor: "#1a3d22",
            }}
          />
        ))}
      </div>
    </div>
  );
}
