import Head from 'next/head'
import Link from 'next/link'
import Layout from '../components/layout'

export default function Home() {
  return (
    <Layout>
      <Head>
      </Head>
      <>
        <h2>home</h2>
        <div>
          <ul>
            <li><Link href="/room/piano"><a>Piano Room</a></Link></li>
          </ul>
        </div>
      </>
    </Layout>
  )
}
