// recolour <in.png> <out.png> <mode: red|grey|car> <targetHex> <targetName>
// Repaints the bike's body panels (selected by colour) in a target colour, keeping the shading.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let w = img.width, h = img.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
let mode = a[3]
let hex = a[4].replacingOccurrences(of: "#", with: "")
let tv = Int(hex, radix: 16)!
let tr = Double((tv >> 16) & 255) / 255, tg = Double((tv >> 8) & 255) / 255, tb = Double(tv & 255) / 255
let name = a[5]

func hsv(_ r: Double, _ g: Double, _ b: Double) -> (Double, Double, Double) {
  let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
  var hh = 0.0
  if d > 0 { if mx == r { hh = (g - b) / d } else if mx == g { hh = (b - r) / d + 2 } else { hh = (r - g) / d + 4 } }
  hh = (hh * 60).truncatingRemainder(dividingBy: 360); if hh < 0 { hh += 360 }
  return (hh, mx == 0 ? 0 : d / mx, mx)
}
func rgb(_ hh: Double, _ s: Double, _ v: Double) -> (Double, Double, Double) {
  let c = v * s, x = c * (1 - abs((hh / 60).truncatingRemainder(dividingBy: 2) - 1)), m = v - c
  let (r, g, b): (Double, Double, Double) = hh < 60 ? (c, x, 0) : hh < 120 ? (x, c, 0) : hh < 180 ? (0, c, x) : hh < 240 ? (0, x, c) : hh < 300 ? (x, 0, c) : (c, 0, x)
  return (r + m, g + m, b + m)
}
func smooth(_ e0: Double, _ e1: Double, _ x: Double) -> Double { let t = min(1, max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
let (th, ts, tvv) = hsv(tr, tg, tb)

// Weight: how much a pixel belongs to the painted body. Reference brightness of the paint.
var weights = [Double](repeating: 0, count: w * h)
var vsum = 0.0, wsum = 0.0
for i in 0..<(w * h) {
  let al = Double(px[i * 4 + 3]) / 255; if al < 0.05 { continue }
  let r = Double(px[i * 4]) / 255 / al, g = Double(px[i * 4 + 1]) / 255 / al, b = Double(px[i * 4 + 2]) / 255 / al
  let (hh, s, v) = hsv(r, g, b)
  var wt = 0.0
  if mode == "red" {
    let dh = min(abs(hh - 0), abs(hh - 360))
    wt = smooth(0.28, 0.48, s) * (1 - smooth(18, 32, dh)) * smooth(0.08, 0.18, v)
  } else if mode == "car" { // silver car body: low saturation, bright; skip hubcaps, plate, underside
    let x = Double(i % w) / Double(w), y = Double(i / w) / Double(h)
    func inEllipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double) -> Bool { let dx = (x - cx) / rx, dy = (y - cy) / ry; return dx * dx + dy * dy < 1 }
    func inPoly(_ p: [(Double, Double)]) -> Bool {
      var c = false; var j = p.count - 1
      for k in 0..<p.count { let (xi, yi) = p[k], (xj, yj) = p[j]
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi { c.toggle() }; j = k }
      return c
    }
    let excluded = inEllipse(0.072, 0.73, 0.05, 0.15) || inEllipse(0.557, 0.77, 0.065, 0.17) || inEllipse(0.9, 0.86, 0.09, 0.16)
      || (x > 0.846 && x < 0.908 && y > 0.607 && y < 0.70) || y > 0.9
      || inPoly([(0.63, 0.09), (0.86, 0.065), (0.935, 0.25), (0.92, 0.28), (0.66, 0.28)])
      || inPoly([(0.235, 0.30), (0.33, 0.115), (0.42, 0.075), (0.545, 0.07), (0.555, 0.20), (0.545, 0.31)])
    // Warm silver reaches ~0.3 saturation in shadow; the red lights are far above that.
    wt = excluded ? 0 : (1 - smooth(0.42, 0.56, s)) * smooth(0.26, 0.36, v) * (s > 0.3 && (hh < 15 || hh > 330) ? 0 : 1)  // never the red lights
  } else { // neutral grey body: mid-tone, low saturation, away from wheels, seat and underside
    let x = Double(i % w) / Double(w), y = Double(i / w) / Double(h)   // bitmap rows are top-down
    func inEllipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double) -> Bool { let dx = (x - cx) / rx, dy = (y - cy) / ry; return dx * dx + dy * dy < 1 }
    func inPoly(_ p: [(Double, Double)]) -> Bool {
      var c = false; var j = p.count - 1
      for k in 0..<p.count { let (xi, yi) = p[k], (xj, yj) = p[j]
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi { c.toggle() }; j = k }
      return c
    }
    let excluded = inEllipse(0.838, 0.835, 0.15, 0.2) || inEllipse(0.19, 0.70, 0.13, 0.19)
      || inPoly([(0.03, 0.19), (0.30, 0.17), (0.47, 0.22), (0.51, 0.36), (0.47, 0.46), (0.30, 0.41), (0.04, 0.31)])
      || (y > 0.70 && x < 0.74) || y < 0.12 || inPoly([(0.0, 0.3), (0.12, 0.3), (0.2, 0.74), (0.0, 0.8)])
    wt = excluded ? 0 : (1 - smooth(0.16, 0.28, s)) * smooth(0.16, 0.24, v) * (1 - smooth(0.78, 0.88, v))
  }
  weights[i] = wt; vsum += v * wt; wsum += wt
}
let vref = vsum / max(wsum, 1)

for i in 0..<(w * h) {
  let wt = weights[i]; if wt <= 0 { continue }
  let al = Double(px[i * 4 + 3]) / 255
  let r = Double(px[i * 4]) / 255 / al, g = Double(px[i * 4 + 1]) / 255 / al, b = Double(px[i * 4 + 2]) / 255 / al
  let (_, s, v) = hsv(r, g, b)
  let shade = v / vref               // 1 = typical paint brightness
  var nr = 0.0, ng = 0.0, nb = 0.0
  switch mode == "car" ? "car-" + name : name {
  case "car-black":
    (nr, ng, nb) = rgb(220, 0.05, min(1, 0.025 + 0.2 * pow(shade, 3.4)))
  case "car-white":
    (nr, ng, nb) = rgb(45, 0.02, min(0.96, 0.50 + 0.34 * pow(min(shade, 1.25), 1.6)))
  case "car-grey":
    (nr, ng, nb) = rgb(215, 0.04, min(1, tvv * (0.25 + 0.85 * pow(shade, 2.2))))
  case "black":
    (nr, ng, nb) = rgb(th, 0.08, min(1, 0.05 + 0.16 * pow(shade, 1.6)))
  case "white":
    (nr, ng, nb) = mode == "red" ? rgb(40, 0.03, min(1, 0.62 + 0.36 * min(shade, 1.25)))
                                 : rgb(40, 0.02, min(1, 0.72 + 0.2 * min(pow(shade, 0.6), 1.3)))
  case "grey", "silver":
    (nr, ng, nb) = rgb(210, 0.05, min(1, tvv * (0.55 + 0.5 * shade)))
  default:
    let ns = mode == "red" ? min(1, ts * (0.7 + 0.3 * s / 0.75)) : ts
    (nr, ng, nb) = mode == "car" ? rgb(th, ns * (1 - 0.55 * smooth(1.12, 1.4, shade)), min(1, tvv * (0.12 + 0.95 * pow(shade, 2.2))))
                                 : rgb(th, ns, min(1, tvv * (0.35 + 0.75 * shade)))
  }
  let o = (r * (1 - wt) + nr * wt, g * (1 - wt) + ng * wt, b * (1 - wt) + nb * wt)
  px[i * 4] = UInt8(max(0, min(255, o.0 * al * 255)))
  px[i * 4 + 1] = UInt8(max(0, min(255, o.1 * al * 255)))
  px[i * 4 + 2] = UInt8(max(0, min(255, o.2 * al * 255)))
}
let out = ctx.makeImage()!
let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dst, out, nil); CGImageDestinationFinalize(dst)
print("ok", name, String(format: "vref %.2f", vref))
