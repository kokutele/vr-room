//@flow

import { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Head from 'next/head'
import Layout, { siteTitle } from '../../components/layout'

import { join } from './libs/mediasoup-handler'

import { selectAudioTracks, selectVideoTracks } from './room-slice'

import {
  Button
} from 'antd'
import {
  UserAddOutlined
} from '@ant-design/icons'

import * as THREE from 'three'
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import style from './piano.module.css'
import { render } from 'react-dom'

function useVRRoom(room:React.RefObject, stream: React.RefObject):void {
  function init( room:HTMLElement ):{ scene:THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGL1Renderer} {
    // setup scene and camera
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera( 45, room.offsetWidth / room.offsetHeight, 1, 1280 )
    camera.position.set( 0, 0, 100 )
    camera.lookAt( 0, 0, 0 )
    
    // setup renderer
    const renderer = new THREE.WebGLRenderer()
    renderer.setSize( room.offsetWidth, room.offsetHeight )

    room.appendChild( renderer.domElement )

    return {
      scene, camera, renderer
    }
  }

  function setupLine( scene:THREE.Scene ):THREE.Line {
    // line
    const material = new THREE.LineBasicMaterial( { color: 0x0000ff } )
    const points = []
    points.push( new THREE.Vector3( -10, 0, 0 ))
    points.push( new THREE.Vector3( 0, 10, 0 ))
    points.push( new THREE.Vector3( 10, 0, 0 ))
    const geometry = new THREE.BufferGeometry().setFromPoints( points )

    const line = new THREE.Line( geometry, material)
    scene.add(line)
  
    return line
  }

  function setupCanvas( scene:THREE.Scene, idx:number ):{ctx: CanvasRenderingContext2D, texture: THREE.Texture} {
    // canvas
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    const texture = new THREE.Texture( canvas )
    const geometry = new THREE.PlaneGeometry(32, 24)
    const material = new THREE.MeshBasicMaterial( {map: texture} )
    const mesh = new THREE.Mesh( geometry, material )
    mesh.rotateY( idx % 2 === 0 ? Math.PI / 2 : -1 * Math.PI / 2 )
    mesh.position.x = idx % 2 === 0 ? -50 : 50
    mesh.position.z = -35 * Math.floor( idx / 2 )
    scene.add(mesh)

    return { ctx, texture }
  }

  const videoTracks = useSelector( selectVideoTracks )

  useEffect( () => {
    const _room = room.current
    const _stream = stream
    let reqId, _videos = []

    if( _room && _stream) {
      const { scene, camera, renderer} = init( _room )
      const line = setupLine( scene )

      _videos = videoTracks.map( ({ peerId, track }, idx) => {
        const {ctx, texture} = setupCanvas( scene, idx )
        const video = document.createElement('video') 
        const stream = new MediaStream([track])
        video.srcObject = stream
        video.autoplay = true

        return {
          peerId, ctx, texture, video, idx
        }
      })

      let direction = 1
      function animation() {
        reqId = requestAnimationFrame(animation)

        // animation - line
        if (line.position.z < -320) direction = 1
        else if (line.position.z > 100) direction = -1
        line.position.z += direction

        // animation - video
        _videos.forEach( ({ctx, texture, video}) => {
          texture.needsUpdate = true
          ctx.drawImage( video, 0, 0, 640, 480 )
        })
        renderer.render(scene, camera)
      }
      animation()
    }

    return function cleanup(){
      // slow but simple way to remove all children;)
      if( _room ) _room.innerText = ''
      if( reqId ) {
        console.log( reqId)
        cancelAnimationFrame(reqId)
      }
      _videos.forEach( item => {
        delete item.texture
        delete item.video
        delete item.ctx
      })
    }
  }, [room, stream, videoTracks])
}

function useVideo( setStream:Function ) {
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({video: true, audio: true})
      .then( setStream )
      .catch( console.error )
  }, [])
}



export default function PianoRoom():React.Node {
  const room = useRef()
  const [stream, setStream] = useState()
  const dispatch = useDispatch()
  const audioTracks = useSelector( selectAudioTracks )

  useVideo(setStream)
  useVRRoom(room, stream)

  useEffect( () => {
    if( stream ) {
      join({ dispatch, roomName: 'test', stream, scalable: 'simple'})
        .then( peer => console.log(peer))
    }
  }, [stream])

  return (
    <Layout>
      <Head>
        <title>{siteTitle} - Piano Room</title>
      </Head>
      <div>
        <div className={style.room} ref={e => room.current = e}></div>
        { false && (
        <div className={style.buttons}>
          <Button type="primary" shape="circle" size="large"
            onClick={e => {
              const peerid = Math.ceil(Math.random() * 1000).toString()
              streams.set( peerid, stream )
              dispatch( addMember(peerid) )
            }}
          danger icon={<UserAddOutlined/>}></Button>
        </div>
        )}
        { audioTracks.map( (item, idx) => (
          <audio ref={e => {
            if( e ) {
              const stream = new MediaStream([ item.track ])
              e.srcObject = stream
            }
          }} key={idx} autoPlay />
        ))}
      </div>
    </Layout>
  )
}