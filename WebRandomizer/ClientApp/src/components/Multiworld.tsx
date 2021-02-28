﻿import React, { useState, useEffect, useRef, useContext } from 'react'
import { Row, Col } from 'reactstrap'
import MessageCard from './util/MessageCard'
import Seed from './Seed'
import Patch from './Patch'
import Connection from './Connection'
import Game from './Game'
import Spoiler from './Spoiler'

import { GameTraitsCtx } from '../game/traits'
import { gameServiceHost, adjustHostname } from '../site'

import Network from '../network'

import { decode } from 'slugid'

export default function Multiworld(props) {
  const network = useRef({} as any)
  const [state, setState] = useState({} as any)
  const [sessionStatus, setSessionStatus] = useState('')
  const [gameStatus, setGameStatus] = useState('')

  const game = useContext(GameTraitsCtx)

  useEffect(() => {
    const sessionGuid = decode(props.match.params.session_id).replace(/-/g, '')
    network.current = new Network(sessionGuid, gameServiceHost(document.baseURI), {
      setState: setState,
      setSessionStatus: setSessionStatus,
      setGameStatus: setGameStatus,
    })

    if (sessionGuid) {
      network.current.start()
      return () => network.current.stop()
    }
  }, []) /* eslint-disable-line react-hooks/exhaustive-deps */

  function onRegisterPlayer(sessionGuid, clientGuid) {
    localStorage.setItem(sessionGuid, clientGuid)
    network.current.onRegisterPlayer(clientGuid)
  }

  function onConnect() {
    network.current.onConnect()
  }

  function onDeviceSelect(device) {
    network.current.onDeviceSelect(device)
  }

  /* State will be delivered from network.start(), but we start out without anything */
  if (state === null) return null

  const { session, clientData, device } = state
  const gameMismatch = session.data && session.data.seed.gameId !== game.id
  return !gameMismatch ? (
    <>
      {session.guid && (
        <Row className="mb-3">
          <Col>
            <Seed
              session={session}
              sessionStatus={sessionStatus}
              onRegisterPlayer={onRegisterPlayer}
            />
          </Col>
        </Row>
      )}
      {clientData !== null && (
        <Row className="mb-3">
          <Col>
            <Patch
              seed={session.data.seed}
              world={session.data.seed.worlds.find((world) => world.worldId === clientData.worldId)}
            />
          </Col>
        </Row>
      )}
      {clientData !== null && (
        <Row className="mb-3">
          <Col>
            <Connection
              clientData={clientData}
              device={device}
              onConnect={onConnect}
              onDeviceSelect={onDeviceSelect}
            />
          </Col>
        </Row>
      )}
      {device.state === 1 && (
        <Row className="mb-3">
          <Col>
            <Game gameStatus={gameStatus} network={network.current} />
          </Col>
        </Row>
      )}
      {session.data !== null && (
        <Row className="mb-3">
          <Col>
            <Spoiler seedData={session.data.seed} />
          </Col>
        </Row>
      )}
    </>
  ) : (
    <MessageCard
      error={true}
      title="This is not quite right :O"
      msg={
        <a href={adjustHostname(document.location.href, session.data.seed.gameId)}>
          Go to the correct domain here
        </a>
      }
    />
  )
}
