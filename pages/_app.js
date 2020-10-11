import { Provider } from 'react-redux'
import createStore from '../app/store'
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  return (
    <Provider store={createStore()}>
      <Component {...pageProps} />
    </Provider>
  )
}

export default MyApp
