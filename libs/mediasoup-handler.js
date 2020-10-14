//@flow

import protooClient from 'protoo-client'
import * as mediasoupClient from 'mediasoup-client'
import randomstring from 'randomstring'
import bowser from 'bowser'
import { 
  setLocalId,
  producerStarted,
  addConsumer, 
  removeConsumer, 
  addTrack,
  removeTrack,
  setLocalStream,
  setAudioProducer,
  setVideoProducer,
} from '../room-slice'


const VIDEO_SIMULCAST_ENCODINGS = [
  { scaleResolutionDownBy: 4 },
  { scaleResolutionDownBy: 2 },
  { scaleResolutionDownBy: 1 }
];

const getDeviceInfo = _ => {
  const ua = navigator.userAgent
  const browser = bowser.getParser( ua )
  let flag

  if( browser.satisfies({chrome: '>=0', chromium: '>=0'}))
    flag='chrome'
  else if( browser.satisfies({firefox: '>=0'}))
    flag='firefox'
  else if( browser.satisfies({safari: '>=0'}))
    flag='safari'
  else if( browser.satisfies({opera: '>=0'}))
    flag='opera'
  else if( browser.satisfies({'microsoft edge': '>=0'}))
    flag='edge'
  else
    flag='unknown'

  return {
    flag,
    name   : browser.getBrowserName(),
    version: browser.getBrowserVersion()
  }
}


type getProtooUrlProps = {
  roomName: string;
  peerId: string;
}
function getProtooUrl({ roomName, peerId }:getProtooUrlProps ): string {
  const hostname = process.env.REACT_APP_MSHOST || window.location.hostname
  const protooPort = process.env.REACT_APP_PORT || 4443

  return `wss://${hostname}:${protooPort}/?roomId=${roomName}&peerId=${peerId}`
}



let sendTransport, recvTransport, producerStatsInterval, peerId

type joinProps = {
  roomName: string;
  scalable: string; // `simulcast` or `simple`
  dispatch: Function;
  stream: MediaStream;
}
export async function join(props:joinProps):Object {
  const peerId = randomstring.generate({
    length: 8,
    capitalization: 'lowercase'
  })
  
  const {
    roomName,
    scalable,
    dispatch,
    stream
  } = props

  const protooUrl = getProtooUrl({roomName, peerId})
  const protooTransport = new protooClient.WebSocketTransport(protooUrl)
  const peer = new protooClient.Peer(protooTransport)

  peer.on('open', async () => {
    dispatch( setLocalId( peerId ))

    console.info('open')

    await _joinRoom(peer, dispatch, { 
      localId: peerId,
      scalable, 
      stream
    })
  })
  peer.on('failed', () => {
    console.warn('failed')
  })
  peer.on('disconnected', () => {
    console.warn('disconnected')
  })
  peer.on('close', () => {
    console.info('closed')
  })
  peer.on('request', async (request, accept, reject) => {
    console.log(`request - ${request.method}`)
    console.log( request.data )
    if( request.method === "newConsumer" ) {
      const {
        peerId,
        producerId,
        id,
        kind,
        rtpParameters,
        type,
        appData,
        producerPaused
      } = request.data

      const consumer = await recvTransport.consume({
        id, producerId, kind, rtpParameters,
        appData: {...appData, peerId}
      })

      if( kind === "audio" ) {
        const receiver = consumer.rtpReceiver
        const receiverStreams = receiver.createEncodedStreams()
        const readableStream = receiverStreams.readable
        const writableStream = receiverStreams.writable

        const transformStream = new TransformStream({
          transform: ( chunk, controller ) => {
            const len = chunk.data.byteLength
            const additionalData = new Uint8Array( chunk.data.slice(-1) )
            // console.log( chunk.timestamp, len, additionalData[0] )

            controller.enqueue( chunk )
          }
        })

        readableStream
          .pipeThrough( transformStream )
          .pipeTo( writableStream )
      }

      const { spatialLayers, temporalLayers } 
        = mediasoupClient.parseScalabilityMode(
          consumer.rtpParameters.encodings[0].scalabilityMode
        )

      dispatch(addTrack( { 
        id, 
        track: consumer.track, 
        peerId, 
        type: "consumer"
      } ))

      dispatch( addConsumer({
        id,
        peerId,
        producerId,
        kind,
        rtpParameters,
        type,
        appData,
        producerPaused,
        spatialLayers,
        temporalLayers
      }))
    }
    accept()
  })

  peer.on('notification', notification => {
    if( notification.method === 'newPeer') {
      console.log(`notification - ${notification.method}`)
      console.log(notification.data)
    } else if ( notification.method === 'consumerClosed' ) {
      console.log(`notification - ${notification.method}`)
      const { consumerId } = notification.data
      console.log(consumerId)

      dispatch( removeTrack( consumerId ) )
      dispatch( removeConsumer(consumerId) )
      //dispatch( removeMomentStats(consumerId))
    } else if ( notification.method.toLowerCase().includes('consumer') ) {
      console.log('===== consumer ========')
      console.log( notification.method )
      console.log( notification.data )
      // if( notification.method === 'consumerLayersChanged')
        // dispatch( setConsumerLayer(notification.data) )
    } else if( notification.method === "activeSpeaker" ) {
      // const { peerId, volume } = notification.data
      // console.log('===== activeSpeaker notification =====', peerId, volume)
      // dispatch( setActiveSpeaker({ peerId, volume }))
    } else {
      // console.log('===== !consumer notification =====')
      // console.log( notification.method )
      // console.log( notification.data )
    }
  })

  return peer
}

type joinRoomProps = {
  localId: string; // local peer id
  scalable: string; // `simple` or `simulcast`
  stream: MediaStream;
}
const _joinRoom = async (
  peer:Peer, dispatch:Function, props: joinRoomProps
) => {
  const { 
    localId,
    scalable, 
    stream
  } = props
  console.log(`_joinRoom(), scalabilityMode=${scalable} localId=${localId}`)
  console.log( props )

  const device = new mediasoupClient.Device()
  const routerRtpCapabilities = await peer.request('getRouterRtpCapabilities')
  await device.load({routerRtpCapabilities})

  // super hack for new autoplay policy of browser
  {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true})
      .catch( err => { throw err } )
    const [ track ] = stream.getAudioTracks()
    track.enabled = false
    setTimeout( _ => track.stop(), 120000 )
  }

  ///////////////////////////////////////////////////////////////
  // Prepare of `sendTransport`
  // This will be used for producer
  // To avoid conflict name of variable, we use block coding pattern
  //
  {
    const {
      id,
      iceParameters,
      iceCandidates,
      dtlsParameters,
      sctpParameters
    } = await peer.request('createWebRtcTransport', {
      forceTcp: false,
      producing: true,
      consuming: false
    })

    sendTransport = device.createSendTransport({
      id,
      iceParameters,
      iceCandidates,
      dtlsParameters,
      sctpParameters,
      iceServers: [],
      additionalSettings: {
        encodedInsertableStreams: true
      },
      proprietaryConstraints: { optional: [ { googDscp: true } ] }
    })

    sendTransport.on('connect', async ({dtlsParameters}, callback, errback) => {
      console.log('sendTransport - connect')

      await peer.request('connectWebRtcTransport', {
        transportId: sendTransport.id,
        dtlsParameters
      }).then( callback ).catch( errback )
    })

    sendTransport.on('produce', ({ kind, rtpParameters, appData}, callback, errback) => {
      console.log('sendTransport - produce')

      peer.request('produce', {
        transportId: sendTransport.id,
        kind,
        rtpParameters,
        appData
      }).then( callback ).catch( errback )
    })
  }
    

  ///////////////////////////////////////////////////////////////
  // Prepare of `recvTransport`
  // This will be used for consumers
  //
  // To avoid conflict name of variable, we use block coding pattern
  //
  // consume - recvTransport
  {
    const {
      id, iceParameters, iceCandidates, dtlsParameters, sctpParameters
    } = await peer.request('createWebRtcTransport', {
      forceTcp: false, producing: false, consuming: true
    })

    recvTransport = device.createRecvTransport({
      id,
      iceParameters,
      iceCandidates,
      dtlsParameters,
      sctpParameters,
      iceServers: [],
      additionalSettings: {
        encodedInsertableStreams: true
      },
    })

    recvTransport.on('connect', ({dtlsParameters}, callback, errback) => {
      console.log('recvTransport - connect')

      peer.request('connectWebRtcTransport', {
        transportId: recvTransport.id, dtlsParameters
      }).then(callback).catch(errback)
    })
  }

  ///////////////////////////////////////////////////
  // Join room
  //
  {
    const deviceInfo = getDeviceInfo()

    await peer.request('join', {
      displayName: 'me', // fix me
      device: deviceInfo,
      rtpCapabilities: device.rtpCapabilities,
    })
  }

  /////////////////////////////////////////////////////
  // Prepare of  `localStream`
  // Which will be used for producer
  //
  // todo - disable this block when `recvOnly` is indicated
  //
  let audioProducer, videoProducer

  setLocalStream( stream )
  dispatch( producerStarted() )

  //////////////////////////////////////////////////////////
  // Prepare of Tracks of procucers
  //
  const [ audioTrack ] = stream.getAudioTracks()
    , [videoTrack ] = stream.getVideoTracks()

  const codecOptions = {
    videoGoogleStartBitrate: 1000
  }
  
  const rtpCapabilities = device.rtpCapabilities

  // we will use H264 only
  const codec = rtpCapabilities.codecs
    .find( c => c.mimeType.toLowerCase() === 'video/h264' )
  console.log( codec )

  let encodings
  switch(scalable) {
  case 'simulcast':
    encodings = VIDEO_SIMULCAST_ENCODINGS
    break
  default:
  }

  ///////////////////////////////////////////////////////////
  // Create producer
  // 
  if( audioTrack ) {
    audioProducer = await sendTransport.produce( { 
      track: audioTrack 
    })
    setAudioProducer( audioProducer )

    dispatch(addTrack({
      id: audioProducer.id, 
      track: audioTrack, 
      peerId: localId, 
      type: "producer"
    }))

    const sender = audioProducer.rtpSender
    const senderStream = sender.createEncodedStreams()
    const readableStream = senderStream.readable
    const writableStream = senderStream.writable
    console.log( sender, senderStream )
    let data = 0

    const transformStream = new TransformStream({
      transform: (chunk, controller) => {
        const len = chunk.data.byteLength
        const container = new Uint8Array( len + 1 )
        container.set( new Uint8Array( chunk.data ), 0 )
        container.set( new Uint8Array( [data] ), len )

        data = (data + 1) % 255

        chunk.data = container.buffer

        controller.enqueue( chunk )
      }
    })

    readableStream
      .pipeThrough( transformStream )
      .pipeTo( writableStream )
  }

  if( videoTrack ) {
    videoProducer = await sendTransport.produce( { 
      track: videoTrack, 
      codecOptions, 
      encodings,
      codec
    })
    dispatch(addTrack({
      id: videoProducer.id, 
      track: videoTrack, 
      peerId: localId, 
      type: "producer"
    }))

    if( videoProducer) setVideoProducer( videoProducer )
  }
}