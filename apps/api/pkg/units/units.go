// Package units holds pure weight/height unit conversions shared by services.
// PRD 0008 stores measurements as value+unit per row and converts to the user's
// preferred unit only at display/computation time — this is the single place
// that math lives, so it can be unit-tested against the mirrored web helper
// (src/lib/units.ts).
package units

import "math"

// Conversion factors.
const (
	// LbPerKg is how many pounds are in one kilogram (1 kg = 2.2046226 lb).
	LbPerKg = 2.2046226
	// CmPerIn is how many centimetres are in one inch (1 in = 2.54 cm).
	CmPerIn = 2.54
)

// round1 rounds to one decimal place — the display precision for converted
// measurements (PRD 0008 §7). Stored values are never rounded.
func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

// ConvertWeight converts value from the `from` unit to the `to` unit ("kg"/"lb"),
// rounded to one decimal. An unknown/equal unit pair returns the value unchanged.
func ConvertWeight(value float64, from, to string) float64 {
	if from == to {
		return value
	}
	switch {
	case from == "kg" && to == "lb":
		return round1(value * LbPerKg)
	case from == "lb" && to == "kg":
		return round1(value / LbPerKg)
	default:
		return value
	}
}

// ConvertHeight converts value from the `from` unit to the `to` unit ("cm"/"in"),
// rounded to one decimal. An unknown/equal unit pair returns the value unchanged.
func ConvertHeight(value float64, from, to string) float64 {
	if from == to {
		return value
	}
	switch {
	case from == "cm" && to == "in":
		return round1(value / CmPerIn)
	case from == "in" && to == "cm":
		return round1(value * CmPerIn)
	default:
		return value
	}
}
