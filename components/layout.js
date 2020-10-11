import Head from 'next/head'
import Link from 'next/link'
import styles from './layout.module.css'

export const siteTitle = "kokutele VR room"

export default function Layout({ children }) {
  return (
    <div className={styles.container}>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content="kokutele VR room"
        />
        <title>{siteTitle}</title>
      </Head>
      <header>
        <h1><Link href="/"><a>{siteTitle}</a></Link></h1>
      </header>
      <main>
        {children}
      </main>
    </div>
  )
}