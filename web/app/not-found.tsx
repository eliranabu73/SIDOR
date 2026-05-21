import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <h2 className="text-lg font-semibold">העמוד לא נמצא</h2>
        <Button asChild>
          <Link href="/schedule">חזרה לסידור</Link>
        </Button>
      </div>
    </div>
  );
}
