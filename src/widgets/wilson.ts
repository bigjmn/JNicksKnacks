export const shuffle = <T>(arr: T[]): T[] =>
  arr.sort(() => Math.random() - 0.5);

export const randomMember = <T>(group: Set<T> | T[]): T => {
  if (
    group instanceof Set && group.size === 0 ||
    group instanceof Array && group.length === 0
  ) {
    throw new Error("empty group");
  }
  const items = group instanceof Set ? Array.from(group) : group;
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
};
export class Cell {
  x: number;
  y: number;
  edges: Cell[];
  neighbors: Cell[];

  constructor(
    x: number,
    y: number,
    neighbors: Cell[] = [],
  ) {
    this.x = x;
    this.y = y;
    this.neighbors = neighbors;
    this.edges = [];
  }

  carveEdge(neighbor: Cell) {
    this.edges.push(neighbor);
    neighbor.edges.push(this);
    return neighbor;
  }

  uncarvedEdges(): Cell[] {
    return this.neighbors.filter((neighbor) =>
      !this.edges.find((cell) => cell === neighbor)
    );
  }
  getTopLeft(cellSize:number):number[]{
    return [cellSize*(this.x),cellSize*(this.y)]
  }

  getCenter(cellSize:number):number[]{
    return [cellSize*(this.x+.5),cellSize*(this.y+.5)]
  }

  fillSelf(ctx:CanvasRenderingContext2D, cellSize:number, color:string):void{
    const [lx, ty] = this.getTopLeft(cellSize)
    ctx.beginPath()
    ctx.moveTo(lx, ty)
    ctx.fillStyle=color 
    ctx.fillRect(lx, ty, cellSize, cellSize)
    ctx.closePath();


  }

  drawOuts(ctx:CanvasRenderingContext2D, cellSize:number):void {
    if (this.edges.length === 0){
        return
    }
    const [cx, cy] = this.getCenter(cellSize)
    ctx.beginPath()
    ctx.lineWidth = cellSize/1.5
    ctx.strokeStyle="white"
    ctx.lineCap="round"
    ctx.moveTo(cx, cy)
    this.edges.forEach((nb) => {
        const [nbx, nby] = nb.getCenter(cellSize)
        ctx.lineTo(nbx, nby)
        ctx.moveTo(cx, cy)

    })
    ctx.closePath()
    ctx.stroke()

  }
}

export class Maze {
  width: number;
  height: number;
  cells: Cell[][];
  start: Cell | null;
  end: Cell | null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = [];
    this.start = null; 
    this.end = null; 

    // Generate cells
    for (let y = 0; y < height; y++) {
      this.cells[y] = [];
      for (let x = 0; x < width; x++) {
        this.cells[y][x] = new Cell(x, y);
      }
    }

    // Set up neighbors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = this.cells[y][x];
        if (x > 0) cell.neighbors.push(this.cells[y][x - 1]); // left
        if (x < width - 1) cell.neighbors.push(this.cells[y][x + 1]); // right
        if (y > 0) cell.neighbors.push(this.cells[y - 1][x]); // top
        if (y < height - 1) cell.neighbors.push(this.cells[y + 1][x]); // bottom
      }
    }
  }

  getCell(x: number, y: number): Cell | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.cells[y][x];
  }
}

export function solveMazeWithRandomDPS(maze: Maze) {
  const visited = new Set<string>();
  async function visit(last: Cell, x: number, y: number) {
    const coord = `${x},${y}`;
    if (visited.has(coord)) {
      return;
    }
    visited.add(`${x},${y}`);

    const current = maze.getCell(x, y);
    if (!current) {
      return
    }
    
    current.carveEdge(last);

    const neighbors: Cell[] = shuffle(current.uncarvedEdges());
    for (const neighbor of neighbors) {
      visit(current, neighbor.x, neighbor.y);
    }
  }

  const rndCell = randomMember(maze.cells.flat());
  visit(rndCell, rndCell.x, rndCell.y);
}

export function timeoutWithCancel(time: number, signal: AbortSignal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, time);

    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

const MAZE_STROKE = "#000"
const MAZE_CONNECTED_FILL="#fff"
const MAZE_CURR_PATH="#888"
export function renderMaze(
    maze:Maze,
    currentCell: Cell | null, 
    currentPath: Cell[],
    ctx: CanvasRenderingContext2D
) {
    const canvas = ctx.canvas 
    const { width, height } = maze 

    ctx.fillStyle = MAZE_STROKE
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const cellSize = canvas.width / width 
    maze.cells.flat().forEach((c) => {
        if (currentPath.includes(c)){
            // const [lx, ty] = c.getTopLeft(cellSize)
            // ctx.moveTo(lx, ty)
            // ctx.fillStyle=MAZE_CURR_PATH
            // ctx.fillRect(lx, ty, cellSize, cellSize)
            c.fillSelf(ctx, cellSize, MAZE_CURR_PATH)

        }
        c.drawOuts(ctx, cellSize)
        if (currentCell === c){
            const [cx, cy] = c.getCenter(cellSize)
            ctx.beginPath()
            ctx.arc(cx, cy, cellSize/4, 0, 2*Math.PI)
            ctx.fillStyle="firebrick"
            ctx.fill()
            ctx.closePath()
        }
    })

    // ctx.strokeStyle=MAZE_STROKE
    // ctx.lineWidth = 1; 

    // for (let y=0; y<height; y++){
    //     for (let x=0; x<width; x++){
    //         const cell = maze.getCell(x,y)
    //         if (cell){
    //             const left = x*cellSize 
    //             const top = y*cellSize 

    //             if (cell.edges.length === 0){
    //                 ctx.fillStyle = MAZE_STROKE
    //             }
    //             if (currentPath.includes(cell)){
    //                 ctx.fillStyle = MAZE_CURR_PATH
    //             }

    //         }
    //     }
    // }
}

export async function wilsonsAlgorithm(maze: Maze, ctx: CanvasRenderingContext2D, cancelSignal: AbortSignal, stepTime: number){
    const unvisited = new Set<Cell>(maze.cells.flat())
    const visited = new Set<Cell>()

    const startCell = randomMember(maze.cells.flat())
    visited.add(startCell)
    unvisited.delete(startCell)

    let stepsTaken = 0 

    while (unvisited.size > 0){
        let path:Cell[] = []
        let current = randomMember(unvisited)

        //random walk until reach maze 
        while (!visited.has(current)){
            stepsTaken += 1
            path.push(current)
            let next = randomMember(current.uncarvedEdges())

            // erase loop if there is one 
            const loopIdx = path.indexOf(next)
            if (loopIdx !== -1){
                path = path.slice(0, loopIdx+1)
            } else {
                path.push(next)
            }
            if (visited.size>1){renderMaze(maze, next, path, ctx)
            if (visited.size === 1){
                const cellsize = ctx.canvas.width/maze.width
                startCell.fillSelf(ctx, cellsize, "white")
                
            }
            await timeoutWithCancel(stepTime, cancelSignal)}

            current = next 
        }

        for (let i = 0; i < path.length - 1; i++) {
            const cell = path[i];
            const nextCell = path[i + 1];
            cell.carveEdge(nextCell);
            visited.add(cell);
            unvisited.delete(cell);
        }
    }
    renderMaze(maze, null, [], ctx);
    await timeoutWithCancel(5000, cancelSignal)
    return stepsTaken


}