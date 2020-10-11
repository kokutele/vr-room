// @flow

import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/////////////////////////////////////////////////////////////
// Mutable states
//

// todo - move to mutableStates
type mutableStatesProps = {
  localStream: ?MediaStream;
  audioProducer: ?Object;
  videoProducer: ?Object;
  tracks: Map<string, MediaStreamTrack>;
}
const mutableStates:mutableStatesProps = {
  localStream: null,
  audioProducer: null,
  videoProducer: null,
  tracks: new Map()
}

export function setLocalStream( stream: MediaStream ) {
  mutableStates.localStream = stream
}

export function setAudioProducer( producer: Object ) {
  mutableStates.audioProducer = producer
}

export function setVideoProducer( producer: Object ) {
  mutableStates.videoProducer = producer
}

/////////////////////////////////////////////////////////////
// Immutable states
//
type MemberState = {
  peerid: string;
}

type trackIdsProps = {
  id: string;
  peerid: string;
  type: string; // `producer` or `consumer`
}

type RoomState = {
  members: Array<MemberState>;
  localId: string;
  isProducerStarted: boolean;
  audioTrackIds: Array<trackIdsProps>;
  videoTrackIds: Array<trackIdsProps>;
  consumers: Array<Object>;
}

const initialState: RoomState = {
  members: [],
  localId: '',
  isProducerStarted: false,
  audioTrackIds: [],
  videoTrackIds: [],
  consumers: [],
}

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    setLocalId: (state, action: PayloadAction<string>) => {
      state.localId = action.payload
    },
    producerStarted: ( state ) => {
      state.isProducerStarted = true
    },
    addAudioTrackId: (state, action: PayloadAction<string>) => {
      const { id, peerId, type } = action.payload
      state.audioTrackIds.push({id, peerId, type })
    },
    addVideoTrackId: (state, action: PayloadAction<videoTrackIdsProps> ) => {
      const { id, peerId, type } = action.payload
      state.videoTrackIds.push({ id, peerId, type })
    },
    removeTrackId: (state, action: PayloadAction<string>) => {
      const id = action.payload
      const audioIdx = state.audioTrackIds.findIndex( _id => _id === id )
      const videoIdx = state.videoTrackIds.findIndex( item => item.id === id )

      if( audioIdx !== -1 ) state.audioTrackIds.splice( audioIdx, 1 )
      if( videoIdx !== -1 ) state.videoTrackIds.splice( audioIdx, 1 )
    },
    addConsumer: (state, action:PayloadAction<Object>) => {
      const consumer = action.payload
      state.consumers.push( consumer )
    },
    removeConsumer: (state, action:PayloadAction<string>) => {
      const id = action.payload
      const idx = state.consumers( item => item.id === id )
      if( idx !== -1 ) state.consumers.splice( idx, 1 )
    }
  }
})

export const { 
  setLocalId,
  producerStarted,
  addAudioTrackId,
  addVideoTrackId,
  addConsumer,
  removeConsumer,
} = roomSlice.actions;

export const addTrack = ( 
  {id, track, peerId, type}:trackIdsProps
) => dispatch => {
  if( track.kind === 'audio' || track.kind === 'video' ) {
    mutableStates.tracks.set( id, track )

    if( track.kind === 'audio' ) {
      dispatch( addAudioTrackId( { id, peerId, type } ) )
    } else {
      dispatch( addVideoTrackId( { id, peerId, type } ))
    }
  }
}

export const removeTrack = ( id:string ) => dispatch => {
  mutableStates.tracks.delete( id )
  dispatch( removeTrackId( id ) )
}

export const selectVideoTracks = state => (
  state.room.videoTrackIds.map( item => (
    {
      ...item,
      track: mutableStates.tracks.get( item.id )
    }
  ))
)

export const selectAudioTracks = state => (
  state.room.audioTrackIds
    .filter( item => item.type === "consumer" )
    .map( item => (
      {
        ...item,
        track: mutableStates.tracks.get( item.id )
      }
    ))
)

export default roomSlice.reducer
