import { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { getProject } from '../../../lib/api'
import { ogLocale } from '../../../i18n/config'
import { absoluteTitle } from '../../../lib/routeMetadata'
import { ProjectDetailClient } from './ProjectDetailClient'

type Props = {
  params: Promise<{ id: string }> | { id: string }
}

/**
 * Per-project document metadata. The title is the project name only — the root
 * layout's `title.template` appends the brand, and `absolute` is used for the
 * error case so the "not found" title is not doubled up (#657).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations('Metadata')
  const locale = await getLocale()
  const resolvedParams = await params
  const id = Number(resolvedParams?.id)

  const notFound = (): Metadata => ({
    title: { absolute: absoluteTitle(t('projectNotFound.title')) },
    description: t('projectNotFound.description'),
    robots: { index: false, follow: false },
  })

  if (!Number.isFinite(id)) return notFound()

  const data = await getProject(id).catch(() => null)
  if (!data) return notFound()

  const { project } = data
  const title = t('project.title', { name: project.name })
  const description = t('project.description', {
    name: project.name,
    type: project.type,
    location: project.location,
    credit: project.credit,
    green: project.green,
    funded: project.funded,
  })

  return {
    title,
    description,
    openGraph: {
      title: t('project.ogTitle', { name: project.name }),
      description,
      type: 'article',
      siteName: 'Heliobond',
      locale: ogLocale(locale),
      images: [
        {
          url: '/assets/og-image.png',
          width: 1200,
          height: 630,
          alt: project.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ProjectDetailPage({ params }: Props) {
  const resolvedParams = await params
  const id = Number(resolvedParams?.id)
  const data = Number.isFinite(id) ? await getProject(id).catch(() => null) : null

  return <ProjectDetailClient id={id} initialData={data} />
}
