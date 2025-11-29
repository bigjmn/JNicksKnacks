"use client"

import { useState, useEffect, useRef } from "react"
import { Cell, Maze, wilsonsAlgorithm } from "./wilson"

export function WilsonMaze(){
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [stepTime, setStepTime] = useState(100)

    const [mazeSize, setMazeSize] = useState(7)

    useEffect(() => {
        const controller = new AbortController()
        const {signal:cancelSignal} = controller 
        const canvas = canvasRef.current; 
        if (!canvas) return; 
        const ctx = canvas.getContext('2d')
        if (!ctx) return; 

        const generateMaze = async () => {
            while (!cancelSignal.aborted){
                const maze = new Maze(mazeSize, mazeSize, true)
                try {
                    const staken = await wilsonsAlgorithm(maze, ctx, cancelSignal, stepTime)
                    console.log(staken)
                } catch (e:unknown){
                    if (e instanceof Error && e.message.includes('aborted')){
                        continue
                    }
                    throw e;
                }
            }
        }
        generateMaze()
        return () => {
            controller.abort()
        }

    }, [stepTime, mazeSize])

    return (
        <div className="w-full justify-center">
            <canvas ref={canvasRef} width={400} height={400} />
        </div>
    )
}