// Every path the interface calls. Each one is in contract/openapi.yaml; add nothing that is not.
import { apiFetch } from './client';
import type { operations } from './schema';
import type {
  Attendance,
  Availability,
  AvailabilityQuery,
  BloodRequest,
  BloodRequestCreate,
  BloodRequestPage,
  Booking,
  BookingPage,
  BookingQuery,
  Cancellation,
  Dashboard,
  DashboardQuery,
  Declination,
  DonationSlot,
  DonationSlotCreate,
  DonationSlotList,
  DonationSlotQuery,
  HoldRelease,
  IssueReversal,
  Organisation,
  OrganisationQuery,
  RequestQuery,
  Session,
  SessionCreate,
  Unit,
  UnitCreate,
  UnitDetail,
  UnitPage,
  UnitQuery,
} from './types';

export const api = {
  /** POST /sessions (sign in). */
  createSession: (body: SessionCreate) =>
    apiFetch<Session>('/sessions', { method: 'POST', body, auth: false, mockPreferCode: 201 }),

  /** GET /actuator/health. Also wakes a sleeping free-tier service before the demo. */
  health: () => apiFetch<{ status: 'UP' | 'DOWN' }>('/actuator/health', { auth: false, timeoutMs: 60_000 }),

  /** GET /actuator/info. Which build of the service is deployed. */
  getInfo: () =>
    apiFetch<operations['getInfo']['responses'][200]['content']['application/json']>('/actuator/info', {
      auth: false,
    }),

  listOrganisations: (query: OrganisationQuery, signal?: AbortSignal) =>
    apiFetch<{ items: Organisation[] }>('/organisations', { query, signal }),

  listUnits: (query: UnitQuery, signal?: AbortSignal) => apiFetch<UnitPage>('/units', { query, signal }),

  /** POST /units. Not idempotent: a repeated reference comes back as 409 DUPLICATE_UNIT_REFERENCE. */
  recordUnit: (body: UnitCreate) => apiFetch<Unit>('/units', { method: 'POST', body, mockPreferCode: 201 }),

  searchAvailability: (query: AvailabilityQuery, signal?: AbortSignal) =>
    apiFetch<Availability>('/availability', { query, signal }),

  listRequests: (query: RequestQuery, signal?: AbortSignal) =>
    apiFetch<BloodRequestPage>('/requests', { query, signal }),

  /** POST /requests. Safe to repeat with the same Idempotency-Key: 201 first time, 200 on a replay. */
  createRequest: (body: BloodRequestCreate, idempotencyKey: string) =>
    apiFetch<BloodRequest>('/requests', { method: 'POST', body, idempotencyKey, mockPreferCode: 201 }),

  getRequest: (requestId: string, signal?: AbortSignal) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}`, { signal }),

  /** POST /requests/{id}/approval. Reserves units; 409 UNITS_NO_LONGER_AVAILABLE when another took them. */
  approveRequest: (requestId: string) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/approval`, {
      method: 'POST',
      mockPreferCode: 201,
    }),

  /** POST /requests/{id}/declination. */
  declineRequest: (requestId: string, body: Declination) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/declination`, {
      method: 'POST',
      body,
      mockPreferCode: 201,
    }),

  /** GET /units/{id}. Holding bank or admin; another bank gets 404, hospitals and donors 403. History oldest first. */
  getUnit: (unitId: string, signal?: AbortSignal) =>
    apiFetch<UnitDetail>(`/units/${encodeURIComponent(unitId)}`, { signal }),

  /** POST /requests/{id}/issue. Request becomes FULFILLED; 409 REQUEST_NOT_APPROVED if pending, issued, lapsed or a unit expired. */
  issueRequest: (requestId: string) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/issue`, {
      method: 'POST',
      mockPreferCode: 201,
    }),

  /** POST /requests/{id}/issue/reversal. Request back to PENDING, unexpired units AVAILABLE; 409 REQUEST_NOT_FULFILLED. */
  reverseIssue: (requestId: string, body: IssueReversal) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/issue/reversal`, {
      method: 'POST',
      body,
      mockPreferCode: 201,
    }),

  /** POST /requests/{id}/cancellation. Requesting hospital only; releases any holds; 409 REQUEST_CLOSED. */
  cancelRequest: (requestId: string, body: Cancellation) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/cancellation`, {
      method: 'POST',
      body,
      mockPreferCode: 201,
    }),

  /** POST /requests/{routineId}/hold-release (ADR-002). Returns the emergency request, APPROVED; 409 HOLD_NOT_RELEASABLE, REQUEST_NOT_PENDING or UNITS_NO_LONGER_AVAILABLE. */
  releaseHoldForEmergency: (requestId: string, body: HoldRelease) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/hold-release`, {
      method: 'POST',
      body,
      mockPreferCode: 201,
    }),

  /** GET /donation-slots. Defaults to the next 14 days; `to` at most 31 days after `from`. */
  listDonationSlots: (query: DonationSlotQuery, signal?: AbortSignal) =>
    apiFetch<DonationSlotList>('/donation-slots', { query, signal }),

  /** POST /donation-slots. Bank staff only. Safe to repeat with the same Idempotency-Key: 201 first time, 200 on a replay. */
  createDonationSlot: (body: DonationSlotCreate, idempotencyKey: string) =>
    apiFetch<DonationSlot>('/donation-slots', { method: 'POST', body, idempotencyKey, mockPreferCode: 201 }),

  /** POST /donation-slots/{id}/bookings. Donors only; 409 SLOT_FULL, ALREADY_BOOKED (a double tap) or SLOT_CLOSED. */
  bookDonationSlot: (slotId: string) =>
    apiFetch<Booking>(`/donation-slots/${encodeURIComponent(slotId)}/bookings`, {
      method: 'POST',
      mockPreferCode: 201,
    }),

  /** GET /bookings. Donors see their own, bank staff their bank's slots; hospitals get 403. */
  listBookings: (query: BookingQuery, signal?: AbortSignal) => apiFetch<BookingPage>('/bookings', { query, signal }),

  /** POST /bookings/{id}/cancellation. The booking's donor only (others 404); 409 BOOKING_NOT_ACTIVE or SLOT_CLOSED. */
  cancelBooking: (bookingId: string) =>
    apiFetch<Booking>(`/bookings/${encodeURIComponent(bookingId)}/cancellation`, {
      method: 'POST',
      mockPreferCode: 201,
    }),

  /** POST /bookings/{id}/attendance. Slot's bank or admin; 409 BOOKING_NOT_ACTIVE or SLOT_NOT_STARTED. */
  recordAttendance: (bookingId: string, body: Attendance) =>
    apiFetch<Booking>(`/bookings/${encodeURIComponent(bookingId)}/attendance`, {
      method: 'POST',
      body,
      mockPreferCode: 201,
    }),

  /** GET /dashboard. Bank staff see their own bank (`bankId` ignored); admin all or one. Labelled with computedAt. */
  getDashboard: (query: DashboardQuery = {}, signal?: AbortSignal) =>
    apiFetch<Dashboard>('/dashboard', { query, signal }),
};
