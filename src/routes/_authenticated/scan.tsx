import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CameraOff, Loader2, QrCode, Search, Sparkles } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ComponentDetail } from "@/components/ComponentDetail";
import { Button } from "@/components/ui/button";
import { identifyComponent, type IdentifyResult } from "@/lib/identify.functions";
import { lookupByCode } from "@/lib/inventory.functions";
import { inventoryQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Scan a component | SAC Inventory" },
      {
        name: "description",
        content:
          "Point your camera at a robotics component to identify it, see where it lives in the SAC room and borrow it in one tap.",
      },
      { property: "og:title", content: "Scan a component | SAC Inventory" },
      {
        property: "og:description",
        content: "Camera-first component identification for the SAC robotics room.",
      },
    ],
  }),
  component: ScanPage;
});

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "live" | "denied">("idle");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [matchedId, setMatchedId] = useState<string | null>(null);

  const inventory = useQuery(inventoryQuery());
  const identify = useServerFn(identifyComponent);
  const lookup = useServerFn(lookupByCode);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("live");
    } catch {
      setCameraState("denied");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("idle");
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    setBusy(true);
    setResult(null);
    setMatchedId(null);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1024 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

      // QR / barcode first — it's exact when a label is present.
      const Detector = (window as unknown as { BarcodeDetector?: new (o?: unknown) => BarcodeDetectorLike })
        .BarcodeDetector;
      if (Detector) {
        try {
          const codes = await new Detector({ formats: ["qr_code", "code_128"] }).detect(canvas);
          const raw = codes[0]?.rawValue?.trim();
          if (raw) {
            const { componentId } = await lookup({ data: { code: raw } });
            if (componentId) {
              setMatchedId(componentId);
              setResult({
                componentId,
                label: "Matched from QR label",
                confidence: "high",
                reason: `Code ${raw}`,
              });
              return;
            }
          }
        } catch {
          /* fall through to AI */
        }
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      const aiResult = await identify({ data: { imageDataUrl: dataUrl } });
      setResult(aiResult);
      setMatchedId(aiResult.componentId);
      if (!aiResult.componentId) toast.error("Couldn't place that one — try the Find tab.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  const component = inventory.data?.components.find((c) => c.id === matchedId);
  const rack = inventory.data?.racks.find((r) => r.id === component?.rack_id);

  return (
    <AppShell title="Scan" subtitle="Hold the part in frame — no part numbers to type.">
      <div className="space-y-4">
        <div className="panel overflow-hidden">
          <div className="relative aspect-[4/3] bg-surface-2">
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full object-cover"
              style={{ display: cameraState === "live" ? "block" : "none" }}
            />
            {cameraState !== "live" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                {cameraState === "denied" ? (
                  <>
                    <CameraOff className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Camera blocked. Allow camera access in your browser, or use the Find tab.
                    </p>
                  </>
                ) : (
                  <>
                    <Camera className="size-8 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Turn on the camera to identify a component or read its QR label.
                    </p>
                  </>
                )}
                <Button onClick={startCamera} variant={cameraState === "denied" ? "secondary" : "default"}>
                  <Camera className="size-4" />
                  {cameraState === "denied" ? "Try again" : "Start camera"}
                </Button>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-primary/60" />
            )}
          </div>

          {cameraState === "live" ? (
            <div className="flex gap-2 border-t border-border p-3">
              <Button className="flex-1" onClick={capture} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy ? "Identifying…" : "Identify part"}
              </Button>
              <Button variant="secondary" onClick={stopCamera}>
                Stop
              </Button>
            </div>
          ) : null}
        </div>

        {result && !component ? (
          <div className="panel space-y-3 p-4">
            <p className="mono-tag text-warning">No catalogue match</p>
            <p className="text-sm">
              Best guess: <span className="font-medium">{result.label}</span>
              {result.reason ? ` — ${result.reason}` : ""}
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/find">
                <Search className="size-4" />
                Search it manually
              </Link>
            </Button>
          </div>
        ) : null}

        {component ? (
          <div className="space-y-2">
            <p className="mono-tag text-accent">
              {result?.confidence === "high" ? "Confident match" : "Best match"} ·{" "}
              {result?.reason || result?.label}
            </p>
            <ComponentDetail component={component} rack={rack} />
          </div>
        ) : null}

        <div className="panel flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <QrCode className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Boxes with a printed QR label are matched instantly. Loose parts fall back to AI
            recognition, and small stuff (resistors, ICs) resolves to its shared bin box.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
