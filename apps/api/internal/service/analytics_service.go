package service

import (
	"context"
	"sort"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/analytics"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/overload"
)

// stallSessions is the default number of recent sessions with no top-set-weight
// increase that flags an exercise as stalled (PRD §4.1).
const stallSessions = 3

// dashboardRecordLimit caps how many personal records the composed dashboard
// returns; the focused /records endpoint returns them all.
const dashboardRecordLimit = 12

type analyticsRepo interface {
	SessionStats(ctx context.Context, userID string, from, to time.Time) (repository.SessionStats, error)
	LastSessionDate(ctx context.Context, userID string) (*time.Time, error)
	SessionDates(ctx context.Context, userID string) ([]time.Time, error)
	DayCounts(ctx context.Context, userID string, from, to time.Time, tz string) ([]repository.DayCount, error)
	VolumeSeries(ctx context.Context, userID string, from, to time.Time, bucket, tz string) ([]repository.VolumeBucket, error)
	MuscleGroups(ctx context.Context, userID string, from, to time.Time) ([]repository.MuscleGroupRow, error)
	PRSets(ctx context.Context, userID string) ([]repository.PRSetRow, error)
	ExerciseTopSets(ctx context.Context, userID string) ([]repository.TopSetRow, error)
}

// AnalyticsService computes the read-only analytics dashboard projections from
// the user's completed sessions (PRD 0007). It stores nothing.
type AnalyticsService struct {
	repo analyticsRepo
	// now is injectable so window resolution is deterministic in tests.
	now func() time.Time
}

// NewAnalyticsService builds an AnalyticsService.
func NewAnalyticsService(repo analyticsRepo) *AnalyticsService {
	return &AnalyticsService{repo: repo, now: time.Now}
}

// ---- response DTOs ----

// Metric is a windowed value with its previous-window value and a signed percent
// delta (nil when the previous window is zero or absent).
type Metric struct {
	Value    float64  `json:"value"`
	Previous float64  `json:"previous"`
	DeltaPct *float64 `json:"delta_pct"`
}

// Summary holds the overview tiles.
type Summary struct {
	Workouts        Metric `json:"workouts"`
	TrainingMinutes Metric `json:"training_minutes"`
	TotalVolume     Metric `json:"total_volume"`
	CurrentStreak   int    `json:"current_streak"`
	LongestStreak   int    `json:"longest_streak"`
	DaysSinceLast   *int   `json:"days_since_last"`
}

// VolumePoint is one bucket of the volume time-series.
type VolumePoint struct {
	BucketStart time.Time `json:"bucket_start"`
	Volume      float64   `json:"volume"`
	Sets        int       `json:"sets"`
}

// MuscleGroupStat is one muscle group's coverage over the window.
type MuscleGroupStat struct {
	MuscleGroup  string  `json:"muscle_group"`
	Sets         int     `json:"sets"`
	Volume       float64 `json:"volume"`
	Frequency    int     `json:"frequency"`
	Undertrained bool    `json:"undertrained"`
}

// CalendarDay is one day's completed-session count for the activity calendar.
type CalendarDay struct {
	Date  string `json:"date"` // YYYY-MM-DD
	Count int    `json:"count"`
}

// ExerciseTrend is a per-exercise progression direction plus stall flag.
type ExerciseTrend struct {
	ExerciseID string  `json:"exercise_id"`
	Name       string  `json:"name"`
	Direction  string  `json:"direction"`
	Change     float64 `json:"change"`
	Stalled    bool    `json:"stalled"`
	Sessions   int     `json:"sessions"`
}

// PersonalRecord is an exercise's all-time best set and estimated 1RM.
type PersonalRecord struct {
	ExerciseID      string  `json:"exercise_id"`
	Name            string  `json:"name"`
	HeaviestWeight  float64 `json:"heaviest_weight"`
	HeaviestReps    int     `json:"heaviest_reps"`
	EstOneRM        float64 `json:"est_one_rm"`
	IsNewThisWindow bool    `json:"is_new_this_window"`
}

// Consistency is the streak + calendar view.
type Consistency struct {
	Window        analytics.Window `json:"window"`
	CurrentStreak int              `json:"current_streak"`
	LongestStreak int              `json:"longest_streak"`
	DaysSinceLast *int             `json:"days_since_last"`
	Calendar      []CalendarDay    `json:"calendar"`
}

// Dashboard is the composed default-screen payload (PRD §5.2).
type Dashboard struct {
	Window       analytics.Window  `json:"window"`
	VolumeUnit   string            `json:"volume_unit"`
	Summary      Summary           `json:"summary"`
	VolumeSeries []VolumePoint     `json:"volume_series"`
	MuscleGroups []MuscleGroupStat `json:"muscle_groups"`
	TrendingUp   []ExerciseTrend   `json:"trending_up"`
	Stalled      []ExerciseTrend   `json:"stalled"`
	Records      []PersonalRecord  `json:"records"`
	Calendar     []CalendarDay     `json:"calendar"`
}

// ---- public entry points ----

// Dashboard computes the whole default screen in one pass.
func (s *AnalyticsService) Dashboard(ctx context.Context, userID, window, tz string) (*Dashboard, error) {
	w, loc, err := s.resolve(window, tz)
	if err != nil {
		return nil, err
	}
	summary, err := s.summary(ctx, userID, w, loc)
	if err != nil {
		return nil, err
	}
	series, err := s.volumeSeries(ctx, userID, w, w.Bucket, tz)
	if err != nil {
		return nil, err
	}
	groups, err := s.muscleGroups(ctx, userID, w)
	if err != nil {
		return nil, err
	}
	trending, stalled, err := s.trends(ctx, userID)
	if err != nil {
		return nil, err
	}
	records, err := s.records(ctx, userID, w)
	if err != nil {
		return nil, err
	}
	if len(records) > dashboardRecordLimit {
		records = records[:dashboardRecordLimit]
	}
	calendar, err := s.calendar(ctx, userID, w, loc)
	if err != nil {
		return nil, err
	}
	return &Dashboard{
		Window:       w,
		VolumeUnit:   analytics.KgUnit,
		Summary:      summary,
		VolumeSeries: series,
		MuscleGroups: groups,
		TrendingUp:   trending,
		Stalled:      stalled,
		Records:      records,
		Calendar:     calendar,
	}, nil
}

// SummaryResult wraps the summary for the focused endpoint.
type SummaryResult struct {
	Window     analytics.Window `json:"window"`
	VolumeUnit string           `json:"volume_unit"`
	Summary    Summary          `json:"summary"`
}

// Summary computes the overview tiles for a window.
func (s *AnalyticsService) Summary(ctx context.Context, userID, window, tz string) (*SummaryResult, error) {
	w, loc, err := s.resolve(window, tz)
	if err != nil {
		return nil, err
	}
	sum, err := s.summary(ctx, userID, w, loc)
	if err != nil {
		return nil, err
	}
	return &SummaryResult{Window: w, VolumeUnit: analytics.KgUnit, Summary: sum}, nil
}

// VolumeResult wraps the volume time-series for the focused endpoint.
type VolumeResult struct {
	Window     analytics.Window `json:"window"`
	VolumeUnit string           `json:"volume_unit"`
	Bucket     string           `json:"bucket"`
	Series     []VolumePoint    `json:"series"`
}

// Volume computes the volume/sets time-series. An explicit bucket
// ("week"|"month"|"session") overrides the window default.
func (s *AnalyticsService) Volume(ctx context.Context, userID, window, tz, bucket string) (*VolumeResult, error) {
	w, _, err := s.resolve(window, tz)
	if err != nil {
		return nil, err
	}
	if bucket != "week" && bucket != "month" && bucket != "session" {
		bucket = w.Bucket
	}
	series, err := s.volumeSeries(ctx, userID, w, bucket, tz)
	if err != nil {
		return nil, err
	}
	return &VolumeResult{Window: w, VolumeUnit: analytics.KgUnit, Bucket: bucket, Series: series}, nil
}

// MuscleGroupsResult wraps the muscle-group breakdown for the focused endpoint.
type MuscleGroupsResult struct {
	Window       analytics.Window  `json:"window"`
	VolumeUnit   string            `json:"volume_unit"`
	MuscleGroups []MuscleGroupStat `json:"muscle_groups"`
}

// MuscleGroups computes per-muscle-group coverage for a window.
func (s *AnalyticsService) MuscleGroups(ctx context.Context, userID, window, tz string) (*MuscleGroupsResult, error) {
	w, _, err := s.resolve(window, tz)
	if err != nil {
		return nil, err
	}
	groups, err := s.muscleGroups(ctx, userID, w)
	if err != nil {
		return nil, err
	}
	return &MuscleGroupsResult{Window: w, VolumeUnit: analytics.KgUnit, MuscleGroups: groups}, nil
}

// Consistency computes the streak + activity calendar for a window.
func (s *AnalyticsService) Consistency(ctx context.Context, userID, window, tz string) (*Consistency, error) {
	w, loc, err := s.resolve(window, tz)
	if err != nil {
		return nil, err
	}
	current, longest, daysSince, err := s.streak(ctx, userID, loc)
	if err != nil {
		return nil, err
	}
	calendar, err := s.calendar(ctx, userID, w, loc)
	if err != nil {
		return nil, err
	}
	return &Consistency{
		Window:        w,
		CurrentStreak: current,
		LongestStreak: longest,
		DaysSinceLast: daysSince,
		Calendar:      calendar,
	}, nil
}

// RecordsResult wraps personal records for the focused endpoint.
type RecordsResult struct {
	Window     analytics.Window `json:"window"`
	VolumeUnit string           `json:"volume_unit"`
	Records    []PersonalRecord `json:"records"`
}

// Records computes all-time personal records, flagging those set in the window.
func (s *AnalyticsService) Records(ctx context.Context, userID, window, tz string) (*RecordsResult, error) {
	w, _, err := s.resolve(window, tz)
	if err != nil {
		return nil, err
	}
	records, err := s.records(ctx, userID, w)
	if err != nil {
		return nil, err
	}
	return &RecordsResult{Window: w, VolumeUnit: analytics.KgUnit, Records: records}, nil
}

// ExerciseTrendsResult wraps trend/stall signals for the focused endpoint.
type ExerciseTrendsResult struct {
	TrendingUp []ExerciseTrend `json:"trending_up"`
	Stalled    []ExerciseTrend `json:"stalled"`
	Exercises  []ExerciseTrend `json:"exercises"`
}

// ExerciseTrends computes per-exercise direction + stall signals (all-time).
func (s *AnalyticsService) ExerciseTrends(ctx context.Context, userID string) (*ExerciseTrendsResult, error) {
	trending, stalled, err := s.trends(ctx, userID)
	if err != nil {
		return nil, err
	}
	all, err := s.allTrends(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &ExerciseTrendsResult{TrendingUp: trending, Stalled: stalled, Exercises: all}, nil
}

// ---- internal builders ----

func (s *AnalyticsService) resolve(window, tz string) (analytics.Window, *time.Location, error) {
	loc := time.UTC
	if tz != "" {
		if l, err := time.LoadLocation(tz); err == nil {
			loc = l
		}
	}
	w, err := analytics.ResolveWindow(window, s.now(), loc)
	if err != nil {
		return analytics.Window{}, nil, validationErr(map[string]any{"window": "unknown window"})
	}
	return w, loc, nil
}

func (s *AnalyticsService) summary(ctx context.Context, userID string, w analytics.Window, loc *time.Location) (Summary, error) {
	cur, err := s.repo.SessionStats(ctx, userID, w.From, w.To)
	if err != nil {
		return Summary{}, err
	}
	var prev repository.SessionStats
	if w.HasPrev {
		prev, err = s.repo.SessionStats(ctx, userID, w.PrevFrom, w.PrevTo)
		if err != nil {
			return Summary{}, err
		}
	}
	current, longest, daysSince, err := s.streak(ctx, userID, loc)
	if err != nil {
		return Summary{}, err
	}
	return Summary{
		Workouts:        makeMetric(float64(cur.Workouts), float64(prev.Workouts), w.HasPrev),
		TrainingMinutes: makeMetric(minutes(cur.ActiveSecs), minutes(prev.ActiveSecs), w.HasPrev),
		TotalVolume:     makeMetric(analytics.Round2(cur.TotalVolume), analytics.Round2(prev.TotalVolume), w.HasPrev),
		CurrentStreak:   current,
		LongestStreak:   longest,
		DaysSinceLast:   daysSince,
	}, nil
}

func (s *AnalyticsService) volumeSeries(ctx context.Context, userID string, w analytics.Window, bucket, tz string) ([]VolumePoint, error) {
	rows, err := s.repo.VolumeSeries(ctx, userID, w.From, w.To, bucket, tzName(tz))
	if err != nil {
		return nil, err
	}
	out := make([]VolumePoint, 0, len(rows))
	for _, r := range rows {
		out = append(out, VolumePoint{BucketStart: r.BucketStart, Volume: analytics.Round2(r.Volume), Sets: r.Sets})
	}
	return out, nil
}

func (s *AnalyticsService) muscleGroups(ctx context.Context, userID string, w analytics.Window) ([]MuscleGroupStat, error) {
	rows, err := s.repo.MuscleGroups(ctx, userID, w.From, w.To)
	if err != nil {
		return nil, err
	}
	weeks := w.Weeks()
	out := make([]MuscleGroupStat, 0, len(rows))
	for _, r := range rows {
		out = append(out, MuscleGroupStat{
			MuscleGroup:  r.MuscleGroup,
			Sets:         r.Sets,
			Volume:       analytics.Round2(r.Volume),
			Frequency:    r.Frequency,
			Undertrained: analytics.IsUndertrained(r.MuscleGroup, r.Sets, weeks),
		})
	}
	return out, nil
}

func (s *AnalyticsService) calendar(ctx context.Context, userID string, w analytics.Window, loc *time.Location) ([]CalendarDay, error) {
	rows, err := s.repo.DayCounts(ctx, userID, w.From, w.To, tzName(loc.String()))
	if err != nil {
		return nil, err
	}
	out := make([]CalendarDay, 0, len(rows))
	for _, r := range rows {
		out = append(out, CalendarDay{Date: r.Date.Format("2006-01-02"), Count: r.Count})
	}
	return out, nil
}

// streak derives current/longest weekly streak and days-since-last from the
// user's completed-session dates (all-time), evaluated in loc.
func (s *AnalyticsService) streak(ctx context.Context, userID string, loc *time.Location) (current, longest int, daysSince *int, err error) {
	dates, err := s.repo.SessionDates(ctx, userID)
	if err != nil {
		return 0, 0, nil, err
	}
	if len(dates) == 0 {
		return 0, 0, nil, nil
	}
	weeks := make([]int, 0, len(dates))
	for _, d := range dates {
		weeks = append(weeks, analytics.WeekIndex(d.In(loc)))
	}
	now := s.now().In(loc)
	current, longest = analytics.WeekStreaks(weeks, analytics.WeekIndex(now))

	last := dates[len(dates)-1].In(loc)
	ly, lm, ld := last.Date()
	lastDay := time.Date(ly, lm, ld, 0, 0, 0, 0, loc)
	ny, nm, nd := now.Date()
	today := time.Date(ny, nm, nd, 0, 0, 0, 0, loc)
	diff := int(today.Sub(lastDay).Hours()/24 + 0.5)
	if diff < 0 {
		diff = 0
	}
	daysSince = &diff
	return current, longest, daysSince, nil
}

// allTrends builds per-exercise trend rows (unsorted, one per exercise).
func (s *AnalyticsService) allTrends(ctx context.Context, userID string) ([]ExerciseTrend, error) {
	rows, err := s.repo.ExerciseTopSets(ctx, userID)
	if err != nil {
		return nil, err
	}
	type acc struct {
		name    string
		weights []float64
	}
	order := []string{}
	byEx := map[string]*acc{}
	for _, r := range rows {
		a, ok := byEx[r.ExerciseID]
		if !ok {
			a = &acc{}
			byEx[r.ExerciseID] = a
			order = append(order, r.ExerciseID)
		}
		a.name = r.Name // latest name wins (rows ordered by date)
		a.weights = append(a.weights, r.TopWeightKg)
	}
	out := make([]ExerciseTrend, 0, len(order))
	for _, id := range order {
		a := byEx[id]
		trend := overload.TrendFromTopWeights(a.weights)
		out = append(out, ExerciseTrend{
			ExerciseID: id,
			Name:       a.name,
			Direction:  trend.Direction,
			Change:     trend.Change,
			Stalled:    analytics.IsStalled(a.weights, stallSessions),
			Sessions:   len(a.weights),
		})
	}
	return out, nil
}

// trends splits per-exercise trends into a trending-up list and a stalled list.
func (s *AnalyticsService) trends(ctx context.Context, userID string) (trendingUp, stalled []ExerciseTrend, err error) {
	all, err := s.allTrends(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	trendingUp = []ExerciseTrend{}
	stalled = []ExerciseTrend{}
	for _, t := range all {
		if t.Direction == "up" {
			trendingUp = append(trendingUp, t)
		}
		if t.Stalled {
			stalled = append(stalled, t)
		}
	}
	sort.SliceStable(trendingUp, func(i, j int) bool { return trendingUp[i].Change > trendingUp[j].Change })
	sort.SliceStable(stalled, func(i, j int) bool { return stalled[i].Sessions > stalled[j].Sessions })
	return trendingUp, stalled, nil
}

// records reduces all set rows to per-exercise personal records, flagging any
// whose heaviest set was achieved within the window.
func (s *AnalyticsService) records(ctx context.Context, userID string, w analytics.Window) ([]PersonalRecord, error) {
	rows, err := s.repo.PRSets(ctx, userID)
	if err != nil {
		return nil, err
	}
	type acc struct {
		name        string
		bestW       float64
		bestReps    int
		bestAt      time.Time
		bestE1RM    float64
		haveHeavier bool
	}
	order := []string{}
	byEx := map[string]*acc{}
	for _, r := range rows {
		a, ok := byEx[r.ExerciseID]
		if !ok {
			a = &acc{}
			byEx[r.ExerciseID] = a
			order = append(order, r.ExerciseID)
		}
		a.name = r.Name
		if !a.haveHeavier || r.WeightKg > a.bestW || (r.WeightKg == a.bestW && r.Reps > a.bestReps) {
			a.bestW = r.WeightKg
			a.bestReps = r.Reps
			a.bestAt = r.PerformedAt
			a.haveHeavier = true
		}
		if e := analytics.Epley1RM(r.WeightKg, r.Reps); e > a.bestE1RM {
			a.bestE1RM = e
		}
	}
	out := make([]PersonalRecord, 0, len(order))
	for _, id := range order {
		a := byEx[id]
		if !a.haveHeavier {
			continue
		}
		inWindow := !a.bestAt.Before(w.From) && a.bestAt.Before(w.To)
		out = append(out, PersonalRecord{
			ExerciseID:      id,
			Name:            a.name,
			HeaviestWeight:  analytics.Round2(a.bestW),
			HeaviestReps:    a.bestReps,
			EstOneRM:        analytics.Round2(a.bestE1RM),
			IsNewThisWindow: inWindow,
		})
	}
	// Heaviest first; new-in-window records surface ahead of ties.
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].IsNewThisWindow != out[j].IsNewThisWindow {
			return out[i].IsNewThisWindow
		}
		return out[i].EstOneRM > out[j].EstOneRM
	})
	return out, nil
}

// ---- helpers ----

func makeMetric(cur, prev float64, hasPrev bool) Metric {
	m := Metric{Value: cur, Previous: prev}
	if hasPrev {
		if pct, ok := analytics.PercentDelta(cur, prev); ok {
			m.DeltaPct = &pct
		}
	}
	return m
}

func minutes(seconds int) float64 {
	return float64(int(float64(seconds)/60 + 0.5))
}

// tzName returns a Postgres-safe timezone name, defaulting to UTC.
func tzName(tz string) string {
	if tz == "" {
		return "UTC"
	}
	return tz
}
