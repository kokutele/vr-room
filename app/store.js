import { combineReducers } from 'redux'
import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
//import logger from 'redux-logger'
import roomSliceReducer from '../pages/room/room-slice'

const rootReducer = combineReducers({
  room: roomSliceReducer
})

export default function rootStore(){
  const middlewareList = [...getDefaultMiddleware()]

  return configureStore({
    reducer: rootReducer,
    middleware: middlewareList,
    devTools: process.env.NODE_ENV !== 'production'
  })
}