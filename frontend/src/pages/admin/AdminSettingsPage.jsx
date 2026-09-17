import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Card, EditableCard, Field, Input } from '../../components/admin/AdminPage'
import FileDropzone from '../../components/admin/FileDropzone'
import AvatarCropperModal from '../../components/AvatarCropperModal'
import HistoryModal from '../../components/admin/HistoryModal'
import Select from '../../components/ui/Select'
import DatePicker from '../../components/ui/DatePicker'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { formatAdminDateLong } from '../../utils/formatDate'

const TIMEZONES = [
  { name: 'Pacific/Pago_Pago', label: '(GMT -11:00) Midway Island, Samoa' },
  { name: 'Pacific/Honolulu', label: '(GMT -10:00) Hawaii' },
  { name: 'America/Anchorage', label: '(GMT -9:00) Alaska' },
  { name: 'America/Tijuana', label: '(GMT -8:00) Chihuahua, La Paz, Mazatlan' },
  { name: 'America/Los_Angeles', label: '(GMT -8:00) Pacific Time (US & Canada); Tijuana' },
  { name: 'America/Phoenix', label: '(GMT -7:00) Arizona' },
  { name: 'America/Denver', label: '(GMT -7:00) Mountain Time (US & Canada)' },
  { name: 'America/Costa_Rica', label: '(GMT -6:00) Central America' },
  { name: 'America/Chicago', label: '(GMT -6:00) Central Time (US & Canada)' },
  { name: 'America/Mexico_City', label: '(GMT -6:00) Guadalajara, Mexico City, Monterrey' },
  { name: 'America/Regina', label: '(GMT -6:00) Saskatchewan' },
  { name: 'America/Bogota', label: '(GMT -5:00) Bogota, Lima, Quito' },
  { name: 'America/New_York', label: '(GMT -5:00) Eastern Time (US & Canada)' },
  { name: 'America/Fort_Wayne', label: '(GMT -5:00) Indiana (East)' },
  { name: 'America/Caracas', label: '(GMT -4:00) Caracas, La Paz' },
  { name: 'America/Halifax', label: '(GMT -4:00) Atlantic Time (Canada); Brasilia, Greenland' },
  { name: 'America/Santiago', label: '(GMT -4:00) Santiago' },
  { name: 'America/St_Johns', label: '(GMT -3:30) Newfoundland' },
  { name: 'America/Argentina/Buenos_Aires', label: '(GMT -3:00) Buenos Aires, Georgetown' },
  { name: 'America/Noronha', label: '(GMT -2:00) Fernando de Noronha' },
  { name: 'Atlantic/Azores', label: '(GMT -1:00) Azores' },
  { name: 'Atlantic/Cape_Verde', label: '(GMT -1:00) Cape Verde Is.' },
  { name: 'Etc/UTC', label: '(GMT) UTC' },
  { name: 'Africa/Casablanca', label: '(GMT +0:00) Casablanca, Monrovia' },
  { name: 'Europe/Dublin', label: '(GMT +0:00) Dublin, Edinburgh, London' },
  { name: 'Europe/Amsterdam', label: '(GMT +1:00) Amsterdam, Berlin, Rome, Stockholm, Vienna' },
  { name: 'Europe/Prague', label: '(GMT +1:00) Belgrade, Bratislava, Budapest, Prague' },
  { name: 'Europe/Paris', label: '(GMT +1:00) Brussels, Copenhagen, Madrid, Paris' },
  { name: 'Europe/Warsaw', label: '(GMT +1:00) Sarajevo, Skopje, Warsaw, Zagreb' },
  { name: 'Africa/Lagos', label: '(GMT +1:00) West Central Africa' },
  { name: 'Europe/Athens', label: '(GMT +2:00) Athens, Beirut, Bucharest' },
  { name: 'Africa/Cairo', label: '(GMT +2:00) Cairo, Egypt' },
  { name: 'Africa/Maputo', label: '(GMT +2:00) Harare' },
  { name: 'Europe/Kiev', label: '(GMT +2:00) Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius' },
  { name: 'Asia/Jerusalem', label: '(GMT +2:00) Jerusalem' },
  { name: 'Africa/Johannesburg', label: '(GMT +2:00) Pretoria' },
  { name: 'Asia/Baghdad', label: '(GMT +3:00) Baghdad' },
  { name: 'Asia/Riyadh', label: '(GMT +3:00) Kuwait, Nairobi, Riyadh' },
  { name: 'Europe/Istanbul', label: '(GMT +3:00) Istanbul, Ankara' },
  { name: 'Europe/Moscow', label: '(GMT +3:00) Moscow, St. Petersburg, Volgograd' },
  { name: 'Asia/Tehran', label: '(GMT +3:30) Tehran' },
  { name: 'Asia/Dubai', label: '(GMT +4:00) Abu Dhabi, Muscat' },
  { name: 'Asia/Baku', label: '(GMT +4:00) Baku, Tbilisi, Yerevan' },
  { name: 'Asia/Kabul', label: '(GMT +4:30) Kabul' },
  { name: 'Asia/Karachi', label: '(GMT +5:00) Islamabad, Karachi, Tashkent' },
  { name: 'Asia/Yekaterinburg', label: '(GMT +5:00) Yekaterinburg' },
  { name: 'Asia/Kolkata', label: '(GMT +5:30) Chennai, Calcutta, Mumbai, New Delhi' },
  { name: 'Asia/Kathmandu', label: '(GMT +5:45) Katmandu' },
  { name: 'Asia/Almaty', label: '(GMT +6:00) Almaty, Novosibirsk' },
  { name: 'Asia/Dhaka', label: '(GMT +6:00) Astana, Dhaka, Sri Jayawardenepura' },
  { name: 'Asia/Rangoon', label: '(GMT +6:30) Rangoon' },
  { name: 'Asia/Bangkok', label: '(GMT +7:00) Bangkok, Hanoi, Jakarta' },
  { name: 'Asia/Krasnoyarsk', label: '(GMT +7:00) Krasnoyarsk' },
  { name: 'Asia/Hong_Kong', label: '(GMT +8:00) Beijing, Chongqing, Hong Kong, Urumqi' },
  { name: 'Asia/Irkutsk', label: '(GMT +8:00) Irkutsk, Ulaan Bataar' },
  { name: 'Asia/Singapore', label: '(GMT +8:00) Kuala Lumpur, Perth, Singapore, Taipei' },
  { name: 'Asia/Tokyo', label: '(GMT +9:00) Osaka, Sapporo, Tokyo' },
  { name: 'Asia/Seoul', label: '(GMT +9:00) Seoul' },
  { name: 'Asia/Yakutsk', label: '(GMT +9:00) Yakutsk' },
  { name: 'Australia/Adelaide', label: '(GMT +9:30) Adelaide' },
  { name: 'Australia/Darwin', label: '(GMT +9:30) Darwin' },
  { name: 'Australia/Brisbane', label: '(GMT +10:00) Brisbane, Guam, Port Moresby' },
  { name: 'Australia/Sydney', label: '(GMT +10:00) Canberra, Hobart, Melbourne, Sydney, Vladivostok' },
  { name: 'Asia/Magadan', label: '(GMT +11:00) Magadan, Soloman Is., New Caledonia' },
  { name: 'Pacific/Auckland', label: '(GMT +12:00) Auckland, Wellington' },
  { name: 'Pacific/Fiji', label: '(GMT +12:00) Fiji, Kamchatka, Marshall Is.' },
  { name: 'Pacific/Kwajalein', label: '(GMT +12:00) International Date Line West' },
]

function LiveClock({ timezone }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const formatted = now.toLocaleString('en-US', {
    timeZone: timezone || 'UTC',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  return <p className="text-xs text-gray-400">The local time here is currently {formatted}</p>
}

function formatPrerenderedAt(iso, timezone) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    timeZone: timezone || 'UTC',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function DisplayValue({ value, fallback = '—' }) {
  return (
    <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
  )
}

export default function AdminSettingsPage() {
  return (
    <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
      <AdminSettingsPageContent />
    </RoleGuard>
  )
}

function AdminSettingsPageContent() {
  const { config, loading, save } = useAdminConfig()
  const [faviconFile, setFaviconFile] = useState(null)
  const [faviconCropSrc, setFaviconCropSrc] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [faviconSaved, setFaviconSaved] = useState(false)
  const [faviconError, setFaviconError] = useState('')

  function closeFaviconCropper() {
    if (faviconCropSrc) URL.revokeObjectURL(faviconCropSrc)
    setFaviconCropSrc(null)
  }

  function handleFaviconCropped(blob) {
    setFaviconFile(new File([blob], 'favicon.png', { type: 'image/png' }))
    setFaviconSaved(false)
    closeFaviconCropper()
  }

  async function handleFaviconSave() {
    if (!faviconFile) return
    setFaviconUploading(true)
    setFaviconError('')
    try {
      const fd = new FormData()
      fd.append('file', faviconFile)
      const res = await fetch('/api/admin/upload-favicon', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { filename } = await res.json()
      await save({ favicon_filename: filename })
      setFaviconFile(null)
      setFaviconSaved(true)
      setTimeout(() => setFaviconSaved(false), 2500)
    } catch (err) {
      setFaviconError(err.message || 'Upload failed')
    } finally {
      setFaviconUploading(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Site Settings">
      {config?.app_version && (
        <p className="text-xs text-gray-400 -mt-6 mb-6">
          Version {config.app_version}
          {formatPrerenderedAt(config.prerendered_at, config.timezone) && (
            <> - prerendered at {formatPrerenderedAt(config.prerendered_at, config.timezone)}</>
          )}
        </p>
      )}
      <div className="flex flex-col gap-6">

        {/* Title card */}
        <EditableCard
          title="Title"
          description="The name used to identify your site around the web"
          savedValues={{ site_title: config?.site_title || '' }}
          onSave={values => save({ site_title: values.site_title })}
        >
          {({ editing, local, set }) => editing ? (
            <Field label="Site Title" hint="Shown in the browser tab and navbar.">
              <Input value={local.site_title} onChange={e => set('site_title', e.target.value)} />
            </Field>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">Site Title</p>
              <DisplayValue value={local.site_title} />
            </div>
          )}
        </EditableCard>

        {/* Timezone card */}
        <EditableCard
          title="Site timezone"
          description="Set the time and date for your site, used for all published posts"
          savedValues={{ timezone: config?.timezone || 'Etc/UTC' }}
          onSave={values => save({ timezone: values.timezone })}
        >
          {({ editing, local, set }) => editing ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Site timezone</label>
              <Select
                value={local.timezone}
                onChange={v => set('timezone', v)}
                options={TIMEZONES.map(tz => ({ value: tz.name, label: tz.label }))}
              />
              <LiveClock timezone={local.timezone} />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">Site timezone</p>
              <p className="text-sm text-gray-900">{TIMEZONES.find(t => t.name === local.timezone)?.label || local.timezone}</p>
              <LiveClock timezone={local.timezone} />
            </div>
          )}
        </EditableCard>

        {/* Favicon card */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Site icon</h2>
              <p className="text-xs text-gray-400 mt-0.5">A square, social icon, at least 60x60px that shows up in search results and browser tabs</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {faviconSaved && <span className="text-xs text-gray-400">Saved</span>}
              {!faviconSaved && (
                <button
                  onClick={handleFaviconSave}
                  disabled={!faviconFile || faviconUploading}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    faviconUploading
                      ? 'bg-white text-gray-500 cursor-default'
                      : faviconFile
                        ? 'bg-[#30cf43] text-white hover:brightness-95'
                        : 'bg-gray-100 text-gray-400 cursor-default'
                  }`}
                >
                  {faviconUploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </div>
          </div>
          <FileDropzone
            accept={{ 'image/png': [], 'image/jpeg': [], 'image/gif': [], 'image/webp': [] }}
            onFile={f => setFaviconCropSrc(URL.createObjectURL(f))}
            file={faviconFile}
            currentUrl={config?.favicon_filename ? `/api/uploads/${config.favicon_filename}` : null}
          />
          {faviconError && <p className="text-xs text-red-500">{faviconError}</p>}
          {faviconCropSrc && (
            <AvatarCropperModal
              imageSrc={faviconCropSrc}
              onCancel={closeFaviconCropper}
              onCropped={handleFaviconCropped}
              cropShape="rect"
              title="Crop your site icon"
            />
          )}
        </Card>

        {/* Domain card */}
        <EditableCard
          title="Custom Domain"
          description="Used for links and automatic SSL certificate issuance."
          savedValues={{ domain: config?.domain || '' }}
          onSave={values => save({ domain: values.domain })}
        >
          {({ editing, local, set }) => editing ? (
            <Field label="Domain" hint="e.g. example.com">
              <Input value={local.domain} onChange={e => set('domain', e.target.value)} placeholder="example.com" />
            </Field>
          ) : (
            <DisplayValue value={local.domain} fallback="No domain set" />
          )}
        </EditableCard>

        {/* Analytics start date card */}
        <EditableCard
          title="Metrics Start Date"
          description="Every Analytics date range is clamped to not go earlier than this date."
          savedValues={{ analytics_start_date: config?.analytics_start_date || '' }}
          onSave={values => save({ analytics_start_date: values.analytics_start_date })}
        >
          {({ editing, local, set }) => editing ? (
            <Field label="Metrics Start Date">
              <DatePicker value={local.analytics_start_date} onChange={v => set('analytics_start_date', v)} />
            </Field>
          ) : (
            <DisplayValue value={formatAdminDateLong(local.analytics_start_date)} fallback="Not set" />
          )}
        </EditableCard>

        {/* History card */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">History</h2>
              <p className="text-xs text-gray-400 mt-0.5">View system event log</p>
            </div>
            <button
              onClick={() => setShowHistory(true)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:text-gray-900 transition-colors flex-shrink-0"
            >
              View History
            </button>
          </div>
        </Card>

      </div>

      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}

    </PageShell>
  )
}
